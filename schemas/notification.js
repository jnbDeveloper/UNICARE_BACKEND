const config = require("../config");
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ["emergency", "appointment"],
  },
  user: {
    type: String,
    required: true,
    enum: ["student", "medical-centre"],
  },
  studentId: {
    type: mongoose.Schema.ObjectId,
    ref: "Student",
    default: null,
  },
  image: {
    type: String,
    maxlength: 200,
    default: null,
  },
  name: {
    type: String,
    required: true,
    maxlength: 100,
  },
  title: {
    type: String,
    required: true,
    maxlength: 50,
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  createdAt: {
    type: Date,
    immutable: true,
    default: () => Date.now(),
  },
});

module.exports = mongoose.model("Notification", notificationSchema);
