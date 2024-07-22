import express, { Request, Response } from "express";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();

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
const expenseCollection = db.collection("expense-tracker");

app.post("/api/add", async (req: Request, res: Response) => {
  try {
    const { userId, dateTime, amount, type, category, title, currency, note } =
      req.body;

    if (
      !userId ||
      !dateTime ||
      !amount ||
      !type ||
      !category ||
      !title ||
      !currency
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }

    const newTransaction = {
      userId,
      dateTime: dateTime,
      amount,
      type,
      category,
      title,
      currency,
      note,
    };

    const result = await expenseCollection.insertOne(newTransaction);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error });
  }
});

// Endpoint to update an expense
app.put("/api/edit/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, dateTime, amount, type, category, title, currency, note } =
      req.body;

    if (
      !userId ||
      !dateTime ||
      !amount ||
      !type ||
      !category ||
      !title ||
      !currency
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }

    const updatedTransaction = {
      userId,
      dateTime: dateTime,
      amount,
      type,
      category,
      title,
      currency,
      note,
    };

    const result = await expenseCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedTransaction }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error });
  }
});

app.delete("/api/remove/:id", async (req, res) => {
  const expenseId = new ObjectId(req.params.id);
  try {
    await expenseCollection.deleteOne({ _id: expenseId });
    res.status(200).send({ message: "Expense deleted successfully" });
  } catch (error) {
    res.status(500).send({ error: "Failed to delete expense" });
  }
});

app.post("/api/expenses", async (req: Request, res: Response) => {
  const { userId, month, year } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    let query: any = { userId };

    if (month && year) {
      const startDate = new Date(`${year}-${month}-01T00:00:00Z`);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 31); // 10 days from startDate

      query.dateTime = {
        $gte: startDate.toISOString(),
        $lt: endDate.toISOString(),
      };
    }

    const expenses = await expenseCollection
      .find(query)
      .sort({ dateTime: -1 })
      .toArray();

    res.json(expenses); // Only one response is sent here
  } catch (error: any) {
    console.error("Fetch expenses error:", error);
    res
      .status(500)
      .json({ error: "Error fetching expenses", details: error.message });
  }
});

// Endpoint to get an expense by ID
app.get("/expense/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const expense = await expenseCollection.findOne({ _id: new ObjectId(id) });

    if (!expense) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.status(200).json(expense);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error });
  }
});

export default app;
