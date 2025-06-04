const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use(express.static("public"));
app.use(express.json());

const allowedStreamer = "VanellopeVonSchweetz";
const users = new Map();

let currentStreamerId = null;

io.on("connection", (socket) => {
  let username = "";

  socket.on("login", (name) => {
    username = name;
    users.set(socket.id, username);
    console.log(`${username} connected`);
    socket.broadcast.emit("chat message", `${username} joined the chat`);

    // If this user is the allowed streamer, set them as the current streamer and notify others
    if (username === allowedStreamer) {
      currentStreamerId = socket.id;
      socket.broadcast.emit("streamer-available", currentStreamerId);
      console.log(`Streamer available: ${currentStreamerId}`);
    } else {
      // Notify streamer that a new viewer joined (if streamer exists)
      if (currentStreamerId) {
        io.to(currentStreamerId).emit("new-viewer", socket.id);
      }
    }
  });

  socket.on("chat message", (msg) => {
    if (username) {
      const formattedMsg = `${username}: ${msg}`;
      io.emit("chat message", formattedMsg);
    }
  });

  socket.on("signal", ({ to, from, data }) => {
    io.to(to).emit("signal", { from, data });
  });

  socket.on("viewer-disconnected", (viewerId) => {
    if (currentStreamerId) {
      io.to(currentStreamerId).emit("viewer-disconnected", viewerId);
    }
  });

  socket.on("disconnect", () => {
    console.log(`${username} disconnected`);
    users.delete(socket.id);
    socket.broadcast.emit("chat message", `${username} left the chat`);

    // If streamer disconnected, clear currentStreamerId and notify others
    if (socket.id === currentStreamerId) {
      currentStreamerId = null;
      socket.broadcast.emit("streamer-available", null);
      console.log("Streamer disconnected, clearing streamerId");
    } else {
      // Notify streamer if viewer disconnected
      if (currentStreamerId) {
        io.to(currentStreamerId).emit("viewer-disconnected", socket.id);
      }
    }
  });
});

app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = new User({ username, email, password: hashed });
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "Email already registered." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const canStream = user.username === allowedStreamer;
  res.json({ username: user.username, canStream });
});

server.listen(3000, () => {
  console.log("Server listening on port 3000");
});
