const mongoose = require("mongoose");

const healthRecordSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.ObjectId,
    ref: "Student",
    required: true,
  },
  doctorName: {
    type: String,
    required: true,
    maxlength: 60,
  },
  doctorRegNo: {
    type: String,
    required: true,
    maxlength: 50,
  },
  disease: {
    type: String,
    required: true,
    maxlength: 50,
  },
  description: {
    type: String,
    required: true,
    minlength: 50,
    maxlength: 1000,
  },
  createdAt: {
    type: Date,
    immutable: true,
    default: () => Date.now(),
  },
});

module.exports = mongoose.model("HealthRecord", healthRecordSchema);
