const express = require("express");
const InvestmentPlan = require("../models/investment-plans");
const User = require("../models/user");
const UserPlan = require("../models/user-plans");
const router = express.Router();
const nodemailer = require("nodemailer");

require("dotenv").config;

let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.AUTH_EMAIL,
    pass: process.env.AUTH_PASS,
  },
});

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
          const { email, firstName, lastName } = response;
          //user found
          //check if plan exists
          await InvestmentPlan.findOne({ _id: planID })
            .then(async (response) => {
              if (response) {
                //plan found

                const { investmentPlanName } = response;

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
                  .then(async () => {
                    //send email
                    const mailOptions = {
                      from: process.env.AUTH_EMAIL,
                      to: email,
                      subject: "Savings plan",
                      html: `<p>Hello <strong>${firstName} ${lastName}</strong>,<br/>You have successfully created a <strong>${investmentPlanName}</strong> savings plan. This is a good step and we encounrage you to keep saving. Your funds are safe with us. Take care of uncertainity</p>`,
                    };

                    await transporter
                      .sendMail(mailOptions)
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
                          message: "An error occured while sending email",
                        });
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
