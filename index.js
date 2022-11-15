const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser").json;
require("dotenv").config();

const app = express();

const PORT = process.env.PORT;

app.use(bodyParser());
app.use(cors());

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});

require("./config/db");

const InvestmentPlanRouter = require("./routes/investment-plans");
const UserRouter = require("./routes/user");
const UserPlanRouter = require("./routes/user-plans");

app.use("/api/admin", InvestmentPlanRouter);
app.use("/api/user", UserRouter);
app.use("/api/user/user-plans", UserPlanRouter);
