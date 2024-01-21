const config = require("../config");
const mongoose = require("mongoose");

const timeslotSchema = new mongoose.Schema({
  startTime: {
    type: Number,
    required: true,
    min: 480, // 08:00
    max: 1020, // 17:00
  },
  endTime: {
    type: Number,
    required: true,
    min: 480, // 08:00
    max: 1020, // 17:00
  },
  createdAt: {
    type: Date,
    immutable: true,
    default: () => Date.now(),
  },
});

module.exports = mongoose.model("TimeSlot", timeslotSchema);
