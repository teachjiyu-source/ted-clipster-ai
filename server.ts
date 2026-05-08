import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Setup multer for uploads
  const upload = multer({ dest: path.join(__dirname, "uploads/") });

  // Ensure uploads and output directories exist
  if (!fs.existsSync(path.join(__dirname, "uploads"))) {
    fs.mkdirSync(path.join(__dirname, "uploads"));
  }
  if (!fs.existsSync(path.join(__dirname, "output"))) {
    fs.mkdirSync(path.join(__dirname, "output"));
  }

  // API Route for video trimming
  app.post("/api/trim", upload.single("video"), async (req, res) => {
    try {
      const file = req.file;
      const { start, end } = req.body;
      
      if (!file || start === undefined || end === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const startTime = parseFloat(start);
      const endTime = parseFloat(end);
      const duration = endTime - startTime;
      
      if (duration <= 0) {
        return res.status(400).json({ error: "Invalid start and end times" });
      }

      const outputFilename = `${Date.now()}_clip.mp4`;
      const outputPath = path.join(__dirname, "output", outputFilename);

      console.log(`Processing video from ${startTime}s to ${endTime}s`);

      ffmpeg(file.path)
        .setStartTime(startTime)
        .setDuration(duration)
        .output(outputPath)
        .videoCodec('libx264')
        .outputOptions(['-preset ultrafast', '-crf 28']) // Optimize for speed in demo
        .on("end", () => {
          console.log(`Successfully created clip: ${outputFilename}`);
          res.download(outputPath, "clip.mp4", (err) => {
             fs.unlink(file.path, () => {});
             fs.unlink(outputPath, () => {});
          });
        })
        .on("error", (err) => {
          console.error("FFmpeg Error:", err);
          if (!res.headersSent) {
             res.status(500).json({ error: "Failed to process video" });
          }
          fs.unlink(file.path, () => {});
        })
        .run();

    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: "Server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // For Express 4
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
