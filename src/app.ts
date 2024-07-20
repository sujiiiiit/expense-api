import express, { Request, Response, NextFunction } from "express";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true,
  })
);

const uri = process.env.MONGODB_URI;
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

const connectDB = async () => {
  try {
    await client.connect();
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

connectDB();

const db = client.db("expense-tracker");
const usersCollection = db.collection("users");
const expensesCollection = db.collection("expenses");

// Generate JWT Token
const generateToken = (userId: string) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }
  return jwt.sign({ id: userId }, secret, { expiresIn: "100h" });
};

// Signup endpoint
app.post("/api/signup", async (req: Request, res: Response) => {
  const { email, password, firstName, lastName } = req.body;
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({
      error: "Email, password, first name, and last name are required",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { email, password: hashedPassword, firstName, lastName };
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
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

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

interface CustomRequest extends Request {
  user?: { id: string };
}

// Add expense endpoint
app.post("/api/expenses", authenticateToken, async (req: CustomRequest, res: Response) => {
  const { userId, dateTime, amount, type, category, title, currency, note } = req.body;

  if (!userId || !dateTime || !amount || !type || !category || !title || !currency) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const newExpense = { userId, dateTime, amount, type, category, title, currency, note };
    const result = await expensesCollection.insertOne(newExpense);
    const insertedExpense = await expensesCollection.findOne({ _id: result.insertedId });
    res.status(201).json(insertedExpense);
  } catch (error: any) {
    console.error("Add expense error:", error);
    res.status(500).json({ error: "Error adding expense", details: error.message });
  }
});


// Get expenses by userId endpoint with pagination and sorting
app.get("/api/expenses/:userId", authenticateToken, async (req: CustomRequest, res: Response) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;
  const sortField = req.query.sortField as string || "dateTime";
  const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

  try {
    const expenses = await expensesCollection
      .find({ userId })
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .toArray();
    const totalExpenses = await expensesCollection.countDocuments({ userId });
    const totalPages = Math.ceil(totalExpenses / limit);

    res.json({
      expenses,
      page,
      totalPages,
      totalExpenses,
    });
  } catch (error: any) {
    console.error("Get expenses error:", error);
    res.status(500).json({ error: "Error fetching expenses", details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
