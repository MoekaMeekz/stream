const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const mongoose = require("mongoose");
const User = require("./models/User");

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use(express.static("public"));

const allowedStreamer = "Vanellope";

// Map socket.id => username
const users = new Map();

io.on("connection", (socket) => {
  let username = "";

  socket.on("login", (name) => {
    username = name;
    users.set(socket.id, username);
    console.log(`${username} connected`);
    socket.broadcast.emit("chat message", `${username} joined the chat`);
  });

  socket.on("chat message", (msg) => {
    if (username) {
      const formattedMsg = `${username}: ${msg}`;
      // Broadcast to everyone including sender
      io.emit("chat message", formattedMsg);
    }
  });

  socket.on("signal", (data) => {
    // Only allow signaling if user is allowed streamer
    if (username === allowedStreamer) {
      // Broadcast to all other clients except sender
      socket.broadcast.emit("signal", data);
    } else {
      console.log(`Blocked signaling attempt from ${username}`);
    }
  });

  socket.on("disconnect", () => {
    if (username) {
      console.log(`${username} disconnected`);
      users.delete(socket.id);
      socket.broadcast.emit("chat message", `${username} left the chat`);
    }
  });
});
const bcrypt = require("bcryptjs");
app.use(express.json());

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
  const canStream = user.username === "VanellopeVonSchweetz";
  res.json({ username: user.username, canStream });
});
server.listen(3000, () => {
  console.log("Server listening on port 3000");
});
