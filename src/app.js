import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import joi from "joi";
import dayjs from "dayjs";

const app = express();

dotenv.config();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);

async function connectToDatabase() {
    try {
        await mongoClient.connect();
        console.log("Connected to the database");
    } catch (error) {
        console.error("Error connecting to the database:", error);
    }
}

const db = mongoClient.db();

function validateData(schema, data) {
    const result = schema.validate(data);
    return result.error ? result.error.details.map(e => e.message) : null;
}

app.post("/participants", async (req, res) => {
    const { name } = req.body;

    const schema = joi.object({
        name: joi.string().required().strict()
    });

    const validationErrors = validateData(schema, req.body);

    if (validationErrors) {
        return res.status(409).send(validationErrors);
    }

    try {
        const existingParticipant = await getParticipantByName(name);

        if (existingParticipant) {
            return res.sendStatus(422);
        }

        await insertParticipant(name);

        await insertStatusMessage(name, "entra na sala...");

        res.sendStatus(201);

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

async function getParticipantByName(name) {
    return await db.collection("participants").findOne({ name });
}

async function insertParticipant(name) {
    await db.collection("participants").insertOne({
        name,
        lastStatus: Date.now()
    });
}

async function insertStatusMessage(from, text) {
    await db.collection("messages").insertOne({
        from,
        to: "Todos",
        text,
        type: "status",
        time: dayjs().format("HH:mm:ss")
    });
}

async function cleanInactiveParticipants() {
    try {
        const inactiveParticipants = await getInactiveParticipants();

        for (const participant of inactiveParticipants) {
            await deleteParticipant(participant._id);
            await insertStatusMessage(participant.name, "sai da sala...");
        }

    } catch (err) {
        console.error(err);
    }
}

async function getInactiveParticipants() {
    return await db.collection("participants").find({ lastStatus: { $lt: Date.now() - 10000 } }).toArray();
}

async function deleteParticipant(id) {
    await db.collection("participants").deleteOne({ _id: new ObjectId(id) });
}

setInterval(cleanInactiveParticipants, 15000);

const PORT = process.env.PORT || 5000;

async function startServer() {
    await connectToDatabase();
    app.listen(PORT, () => console.log(`Server ${PORT}`));
}

startServer();