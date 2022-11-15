const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const InvestmentPlanSchema = new Schema({
  investmentPlanName: String,
  interestRate: Number,
});

const InvestmentPlan = mongoose.model("InvestmentPlan", InvestmentPlanSchema);
module.exports = InvestmentPlan;
