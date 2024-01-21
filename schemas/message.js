const config = require("../config");
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    maxlength: 500,
  },
  studentId: {
    type: mongoose.Schema.ObjectId,
    ref: "Student",
    required: true,
  },
  from: {
    type: String,
    required: true,
    enum: ["student", "medical-centre"],
  },
  to: {
    type: String,
    required: true,
    enum: ["student", "medical-centre"],
  },
  seen: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    immutable: true,
    default: () => Date.now(),
  },
});

module.exports = mongoose.model("Message", messageSchema);
