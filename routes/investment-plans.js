const express = require("express");
const InvestmentPlan = require("../models/investment-plans");
const router = express.Router();

//post new plan available
router.post("/add-investmen-plan", async (req, res) => {
  let { investmentPlanName, interestRate } = req.body;

  if (!investmentPlanName) {
    res.json({
      status: "Failed",
      message: "Please enter a name of an investment plan",
    });
  } else if (!interestRate) {
    res.json({
      status: "Failed",
      message: "Please enter an interest rate of the investment plan",
    });
  } else {
    investmentPlanName = investmentPlanName.trim();
    const newInvestmentPlan = new InvestmentPlan({
      investmentPlanName,
      interestRate,
    });

    await newInvestmentPlan
      .save()
      .then(() => {
        res.json({
          status: "Success",
          message: "Successfully added investment plan",
        });
      })
      .catch((err) => {
        console.log(err);
        res.json({
          status: "Failed",
          message: "An error occured while trying to save the investment plan",
        });
      });
  }
});

module.exports = router;
