const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

require("dotenv").config();

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();

const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// MONGODB CLIENT

const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // CONNECT DATABASE

    await client.connect();
    console.log("MongoDB Connected");

    // DATABASE

    const database = client.db("ideaVaultDB");

    const usersCollection = database.collection("users");

      // REGISTER API
      
    app.post("/register", async (req, res) => {
      try {
        const { name, email, password, photo } = req.body;

        // CHECK EXISTING USER

        const existingUser = await usersCollection.findOne({
          email,
        });

        if (existingUser) {
          return res.status(400).send({
            message: "User already exists",
          });
        }

        // HASH PASSWORD

        const hashedPassword = await bcrypt.hash(password, 10);

        // CREATE USER

        const newUser = {
          name,
          email,
          photo,
          password: hashedPassword,
          createdAt: new Date(),
        };

        // SAVE USER

        const result = await usersCollection.insertOne(newUser);

        // GENERATE JWT

        const token = jwt.sign({ email }, process.env.JWT_SECRET, {
          expiresIn: "7d",
        });

        res.send({
          success: true,
          token,
          result,
        });
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    // ROOT ROUTE

    app.get("/", (req, res) => {
      res.send("IdeaVault Server Running");
    });
  } catch (error) {
    console.log(error);
  }
}

run();

// SERVER

app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
