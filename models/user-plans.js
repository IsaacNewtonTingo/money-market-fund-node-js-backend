const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserPlanSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InvestmentPlan",
  },
  amountAvailable: Number,
  active: Boolean,
  dateCreated: Date,
  maturityDate: Date,
});

const UserPlan = mongoose.model("UserPlan", UserPlanSchema);
module.exports = UserPlan;
