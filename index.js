const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();

const port = process.env.PORT || 5001;

app.use(cors({
  origin: ["http://localhost:5173", "https://ideavault-client-one.vercel.app"],
  credentials: true
}));
app.use(express.json());

// MONGODB CLIENT

const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// CONNECT DATABASE
client.connect()
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// DATABASE
const database = client.db("ideaVaultDB");

const usersCollection = database.collection("users");
const ideasCollection = database.collection("ideas");
const interactionsCollection = database.collection("interactions");
const commentsCollection = database.collection("comments");

    // JWT VERIFICATION MIDDLEWARE

    const verifyJWT = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authHeader.split(" ")[1];
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

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
          user: {
            name,
            email,
            photo,
            _id: result.insertedId,
          },
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

    // CHECK USER EXISTS API
    app.get("/users/check/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send({ exists: !!user });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // GOOGLE LOGIN API

    app.post("/google-login", async (req, res) => {
      try {
        const { name, email, photo } = req.body;
        let user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "Account not found. Please register first."
          });
        }

        const token = jwt.sign({ email }, process.env.JWT_SECRET, {
          expiresIn: "7d",
        });

        res.send({
          success: true,
          token,
          user: {
            name: user.name,
            email: user.email,
            photo: user.photo,
            _id: user._id,
          },
        });
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    // USER PROFILE UPDATE API

    app.put("/users/profile", verifyJWT, async (req, res) => {
      try {
        const email = req.decoded.email;
        const { name, photo } = req.body;

        const query = { email };
        const updateDoc = {
          $set: {
            name,
            photo,
          },
        };

        await usersCollection.updateOne(query, updateDoc);

        // Update name/photo in other collections to keep details consistent
        await ideasCollection.updateMany({ userEmail: email }, { $set: { userName: name } });
        await commentsCollection.updateMany({ userEmail: email }, { $set: { userName: name, userPhoto: photo } });

        const updatedUser = await usersCollection.findOne(query);
        const userCopy = { ...updatedUser };
        delete userCopy.password;

        res.send({
          success: true,
          user: userCopy,
        });
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    // IDEAS API

    app.post("/ideas", verifyJWT, async (req, res) => {
      try {
        const newIdea = req.body;
        newIdea.userEmail = req.decoded.email;
        newIdea.createdAt = new Date();

        const result = await ideasCollection.insertOne(newIdea);
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.get("/my-ideas", verifyJWT, async (req, res) => {
      try {
        const email = req.decoded.email;
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
        const search = req.query.search || "";
        const filter = req.query.filter || "";

        let query = {};

        if (search) {
          query.title = { $regex: search, $options: "i" };
        }

        if (filter) {
          query.category = filter;
        }

        const result = await ideasCollection
          .find(query)
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

    app.put("/ideas/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedIdea = req.body;

        const originalIdea = await ideasCollection.findOne(query);
        if (!originalIdea) {
          return res.status(404).send({ message: "Idea not found" });
        }
        if (originalIdea.userEmail !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const updateDoc = {
          $set: {
            title: updatedIdea.title,
            shortDescription: updatedIdea.shortDescription,
            description: updatedIdea.description,
            category: updatedIdea.category,
            image: updatedIdea.image,
            budget: updatedIdea.budget,
            tags: updatedIdea.tags,
            targetAudience: updatedIdea.targetAudience,
            problemStatement: updatedIdea.problemStatement,
            proposedSolution: updatedIdea.proposedSolution,
            updatedAt: new Date(),
          },
        };

        const result = await ideasCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.delete("/ideas/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const originalIdea = await ideasCollection.findOne(query);
        if (!originalIdea) {
          return res.status(404).send({ message: "Idea not found" });
        }
        if (originalIdea.userEmail !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await ideasCollection.deleteOne(query);
        // Clean up associated comments
        await commentsCollection.deleteMany({ ideaId: id });

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to delete idea",
        });
      }
    });

    // INTERESTED API

    app.post("/interested", verifyJWT, async (req, res) => {
      try {
        const interaction = req.body;
        interaction.userEmail = req.decoded.email;
        interaction.createdAt = new Date();
        
        // Prevent duplicate interest records
        const existing = await interactionsCollection.findOne({
          ideaId: interaction.ideaId,
          userEmail: interaction.userEmail
        });
        if (existing) {
          return res.status(400).send({ message: "You have already marked interest in this idea" });
        }

        const result = await interactionsCollection.insertOne(interaction);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // COMMENTS API

    app.post("/comments", verifyJWT, async (req, res) => {
      try {
        const { ideaId, ideaTitle, commentText } = req.body;
        const email = req.decoded.email;

        const user = await usersCollection.findOne({ email });

        const newComment = {
          ideaId,
          ideaTitle,
          commentText,
          userEmail: email,
          userName: user?.name || "Anonymous",
          userPhoto: user?.photo || "",
          createdAt: new Date(),
        };

        const result = await commentsCollection.insertOne(newComment);
        res.send({ success: true, result, comment: newComment });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/ideas/:id/comments", async (req, res) => {
      try {
        const ideaId = req.params.id;
        const query = { ideaId };
        const result = await commentsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.put("/comments/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const { commentText } = req.body;

        const comment = await commentsCollection.findOne(query);
        if (!comment) {
          return res.status(404).send({ message: "Comment not found" });
        }
        if (comment.userEmail !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const updateDoc = {
          $set: {
            commentText,
            updatedAt: new Date(),
          },
        };

        const result = await commentsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.delete("/comments/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const comment = await commentsCollection.findOne(query);
        if (!comment) {
          return res.status(404).send({ message: "Comment not found" });
        }
        if (comment.userEmail !== req.decoded.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await commentsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // MY INTERACTIONS API (SHOWS IDEAS USER HAS COMMENTED ON)

    app.get("/my-interactions", verifyJWT, async (req, res) => {
      try {
        const email = req.decoded.email;

        // Find unique ideaIds user has commented on
        const userComments = await commentsCollection.find({ userEmail: email }).toArray();
        const ideaIds = [...new Set(userComments.map((comment) => comment.ideaId))];

        if (ideaIds.length === 0) {
          return res.send([]);
        }

        // Fetch ideas corresponding to those IDs
        const query = {
          _id: { $in: ideaIds.map((id) => new ObjectId(id)) },
        };
        const result = await ideasCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to fetch interactions",
        });
      }
    });

    // ROOT ROUTE

    app.get("/", (req, res) => res.send("IdeaVolt Server is running"));

// SERVER

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on ${port}`);
  });
}

module.exports = app;
