const express = require("express");
const router = express.Router();
const Faculty = require("../schemas/faculty");

router.get("/all", async (req, res) => {
  const faculties = await Faculty.find({});

  return res.json({
    status: "success",
    faculties: faculties,
  });
});

module.exports = router;
