const config = require("../config");
const mongoose = require("mongoose");
const dayjs = require("dayjs");

const appointmentSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.ObjectId,
    ref: "Student",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  description: {
    type: String,
    required: true,
    maxlength: 500,
    minlength: 50,
  },
  checked: {
    type: Boolean,
    default: false,
  },
  checkedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    immutable: true,
    default: () => Date.now(),
  },
});

appointmentSchema.pre("save", function (next) {
  if (this.isModified("date")) {
    this.date = dayjs(this.date).format("YYYY-MM-DD");
  }
  next();
});

module.exports = mongoose.model("Appointment", appointmentSchema);
