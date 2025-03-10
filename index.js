const express = require("express");
const multer = require("multer");
const Tesseract = require("tesseract.js");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.json({ limit: '50mb' })); // Increase the request body size limit
app.use(cors({
    // origin: "http://localhost:3000", // Replace with your client's URL
    origin: "https://convertmastery.com", // Replace with your client's URL
    credentials: true,
  }));

// Configure Multer for image uploads
const upload = multer({ dest: "uploads/" });
app.use('/uploads/converted', express.static(path.join(__dirname, 'converted')));

// Ensure the 'converted' directory exists
const convertedDir = path.join(__dirname, 'converted');
if (!fs.existsSync(convertedDir)) {
  fs.mkdirSync(convertedDir);
}

// OCR Route
app.post("/api/convert-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const imagePath = path.join(__dirname, req.file.path);

    // Perform OCR using Tesseract.js
    const { data } = await Tesseract.recognize(imagePath, "eng", {
      logger: (m) => console.log(m), // Log progress
    });

    // Delete image after processing
    fs.unlinkSync(imagePath);

    res.json({ text: data.text });
  } catch (error) {
    console.error("OCR Error:", error);
    res.status(500).json({ error: "Failed to process image" });
  }
});

// Video Conversion Route
// Add this route for progress updates
// Progress Route
app.get("/api/progress", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  
    // Send progress updates to the client
    const sendProgress = (progress) => {
      console.log(`Sending progress: ${progress}%`); // Log progress
      res.write(`data: ${JSON.stringify({ progress })}\n\n`);
    };
  
    // Store the sendProgress function in a global variable (for simplicity)
    global.sendProgress = sendProgress;
  
    // Handle client disconnect
    req.on("close", () => {
      console.log("Client disconnected from progress stream");
      global.sendProgress = null;
    });
  });
  
  // Video Conversion Route
 function parseTimeToSeconds(time) {
  const [hh, mm, ss] = time.split(":").map(parseFloat);
  return hh * 3600 + mm * 60 + ss;
}

app.post("/api/convert-video", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No video uploaded" });
    }

    const videoPath = path.join(__dirname, req.file.path);

    // Validate the selected format
    const validFormats = ["mp4", "avi", "mov", "flv", "mkv", "webm"];
    const format = validFormats.includes(req.body.format) ? req.body.format : "mp4"; // Default to mp4 if invalid

    const outputFile = path.join(convertedDir, `${Date.now()}.${format}`); // Use the selected format in the output file name

    // Set FFmpeg path
    ffmpeg.setFfmpegPath(ffmpegPath);

    let totalDuration = 0;

    // Start video conversion using ffmpeg
    ffmpeg(videoPath)
      .output(outputFile)
      .on("codecData", (data) => {
        // Log the codecData object to inspect its properties
        console.log("codecData:", data);

        // Parse the duration into seconds
        totalDuration = parseTimeToSeconds(data.duration);
        if (isNaN(totalDuration) || totalDuration <= 0) {
          console.error("Invalid duration:", data.duration);
          totalDuration = 0; // Reset to 0 to avoid Infinity
        }
      })
      .on("progress", (progress) => {
        // Log the progress object to inspect its properties
        console.log("progress:", progress);

        let percent = 0;
        if (totalDuration > 0) {
          const currentTime = parseTimeToSeconds(progress.timemark); // Convert timemark to seconds
          percent = Math.round((currentTime / totalDuration) * 100);
        }

        console.log(`Conversion progress: ${percent}%`); // Log progress
        if (global.sendProgress) {
          global.sendProgress(percent); // Send progress to the client
        }
      })
      .on("end", () => {
        const videoUrl = `https://convert-mastery-backend.vercel.app/uploads/converted/${path.basename(outputFile)}`;
        // const videoUrl = `http://localhost:3000/uploads/converted/${path.basename(outputFile)}`;
        res.json({ url: videoUrl });
      })
      .on("error", (err, stdout, stderr) => {
        console.error("Video conversion error:", err);
        console.error("stdout:", stdout);
        console.error("stderr:", stderr);
        res.status(500).json({ error: "Video conversion failed", details: err.message });
      })
      .run();
  } catch (error) {
    console.error("Video upload error:", error);
    res.status(500).json({ error: "Failed to upload video", details: error.message });
  }
}); 
  

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});