const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const ideasCollection = database.collection("ideas");
    const interactionsCollection = database.collection("interactions");

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

    // LOGIN API

    app.post("/login", async (req, res) => {
      try {
        const { email, password } = req.body;

        // CHECK USER

        const user = await usersCollection.findOne({ email });

        if (user) {
          const safeUser = { ...user };
          if (safeUser.password) safeUser.password = "***";
          console.log("Found User:", safeUser);
        }

        if (!user) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        // PASSWORD MATCH

        const isPasswordMatched = await bcrypt.compare(password, user.password);

        if (!isPasswordMatched) {
          return res.status(401).send({
            message: "Invalid password",
          });
        }

        // GENERATE JWT

        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
          expiresIn: "7d",
        });

        const userCopy = { ...user };
        delete userCopy.password;

        res.send({
          success: true,
          token,
          user: userCopy,
        });
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    // IDEAS API

    app.post("/ideas", async (req, res) => {
      try {
        const newIdea = req.body;
        newIdea.createdAt = new Date();

        const result = await ideasCollection.insertOne(newIdea);
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.get("/my-ideas", async (req, res) => {
      try {
        const email = req.query.email;
        const query = { userEmail: email };
        const result = await ideasCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.get("/ideas", async (req, res) => {
      try {
        const result = await ideasCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to fetch ideas",
        });
      }
    });

    app.get("/trending-ideas", async (req, res) => {
      try {
        const result = await ideasCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to fetch trending ideas",
        });
      }
    });

    app.get("/ideas/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await ideasCollection.findOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to fetch idea",
        });
      }
    });

    app.post("/interested", async (req, res) => {
      try {
        const interactionData = req.body;
        interactionData.createdAt = new Date();

        const result = await interactionsCollection.insertOne(interactionData);
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to save interaction",
        });
      }
    });

    app.delete("/ideas/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await ideasCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to delete idea",
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
