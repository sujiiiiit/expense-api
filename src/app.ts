import express, { Request, Response, NextFunction } from "express";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

const uri = process.env.MONGODB_URI;
console.log(uri)
if (!uri) {
  throw new Error("MONGODB_URI is not defined");
}
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Connect to MongoDB
const connectDB = async () => {
  try {
    await client.connect();
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1); // Exit process with failure
  }
};

connectDB();

// Get the database
const db = client.db("expense-tracker");
const usersCollection = db.collection("users");

// Generate JWT Token
const generateToken = (userId: string) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }
  return jwt.sign({ id: userId }, secret, { expiresIn: "1h" });
};

// Signup endpoint
app.post("/api/signup", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { email, password: hashedPassword };
    const result = await usersCollection.insertOne(newUser);
    const token = generateToken(result.insertedId.toHexString());
    res.status(201).json({ token });
  } catch (error: any) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Error creating user", details: error.message });
  }
});

// Login endpoint
app.post("/api/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = generateToken(user._id.toHexString());
    res.json({ token });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Error logging in", details: error.message });
  }
});

// Middleware to check token
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) return res.sendStatus(403);
    (req as CustomRequest).user = user as { id: string };
    next();
  });
};

// Get current user
app.get("/api/current", authenticateToken, async (req: CustomRequest, res: Response) => {
  try {
    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.user?.id) },
      { projection: { password: 0 } }
    );
    res.json(user);
  } catch (error: any) {
    console.error("Fetch current user error:", error);
    res.status(500).json({ error: "Error fetching user", details: error.message });
  }
});

interface CustomRequest extends Request {
  user?: { id: string };
}

export default app;
