const express = require("express");
const InvestmentPlan = require("../models/investment-plans");
const User = require("../models/user");
const UserPlan = require("../models/user-plans");
const router = express.Router();

//join plan
router.post("/join-plan", async (req, res) => {
  let { userID, planID, maturityDate } = req.body;

  if (!userID) {
    res.json({
      status: "Failed",
      message: "User ID is missing",
    });
  } else if (!planID) {
    res.json({
      status: "Failed",
      message: "Plan ID is missing",
    });
  } else {
    //check if user exists
    await User.findOne({ _id: userID })
      .then(async (response) => {
        if (response) {
          //user found
          //check if plan exists
          await InvestmentPlan.findOne({ _id: planID })
            .then(async (response) => {
              if (response) {
                //plan found

                const newUserPlan = new UserPlan({
                  user: userID,
                  plan: planID,
                  amountAvailable: 0,
                  active: false,
                  dateCreated: Date.now(),
                  maturityDate:
                    planID === "637396ec11bf84a62c63cafa"
                      ? Date.now() + maturityDate * 86400000
                      : null,
                });

                await newUserPlan
                  .save()
                  .then(() => {
                    res.json({
                      status: "Success",
                      message: "Plan created successfully",
                    });
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({
                      status: "Failed",
                      message: "An error occured while saving user plan",
                    });
                  });
              } else {
                //plan not found
                res.json({
                  status: "Failed",
                  message:
                    "Investment plan doesn't exist. Might have been deleted",
                });
              }
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "An error occured while checking plan details",
              });
            });
        } else {
          res.json({
            status: "Failed",
            message: "User not found. Might have been deleted",
          });
        }
      })
      .catch((err) => {
        console.log(err);
        res.json({
          status: "Failed",
          message: "An error occured while getting user records",
        });
      });
  }
});

//get user plans
router.get("/get-my-plans/:id", async (req, res) => {
  const userID = req.params.id;

  if (!userID) {
    res.json({
      status: "Failed",
      message: "User ID is missing",
    });
  } else {
    //check if user exists
    await User.findOne({ _id: userID })
      .then(async (response) => {
        if (response) {
          //user found
          //get user plans

          await UserPlan.find({ user: userID })
            .populate("plan")
            .then((response) => {
              res.send(response);
            })
            .catch((err) => {
              console.log(err);
              res.json({
                status: "Failed",
                message: "An error occured while gettin user plan records",
              });
            });
        } else {
          //user not found
          res.json({
            status: "Failed",
            message: "User not found. Might have been deleted",
          });
        }
      })
      .catch((err) => {
        console.log(err);
        res.json({
          status: "Failed",
          message: "An error occured while checking user records",
        });
      });
  }
});

module.exports = router;
