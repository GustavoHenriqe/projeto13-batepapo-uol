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

const validateSchema = async (schema, data) => {
    const result = await schema.validate(data);
    if (result.error) {
        return true
    }
    return false;
};

app.post("/participants", async (req, res) => {
    const { name } = req.body;

    const schema = joi.object({
        name: joi.string().required().strict()
    });

    const validationErrors = validateSchema(schema, req.body);

    if (!validationErrors) {
        return res.status(422).send(validationErrors);
    }

    try {
        const existingParticipant = await db.collection("participants").findOne({ name });

        if (existingParticipant) {
            return res.sendStatus(409);
        }

        await db.collection("participants").insertOne({
            name,
            lastStatus: Date.now()
        });

        await db.collection("messages").insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss")
        });

        res.sendStatus(201);

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find({}).toArray();
        res.status(200).send(participants);

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const { user } = req.headers;

    const schema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().required()
    });

    const validationErrors = schema.validate(req.body)

    if ( type !== "message" || type !== "private_message" ) {
        return res.sendStatus(422)
    }

    if ( !user ) {
        return res.sendStatus(422)
    }

    if ( validationErrors ) {
        return res.sendStatus(422)
    }

    try {
        const sender = await db.collection("participants").findOne({ user });

        if (sender === null) {
            return res.sendStatus(422);
        }

        res.sendStatus(201);

        await db.collection("messages").insertOne({
            from: user,
            to,
            text,
            type,
            time: dayjs().format("HH:mm:ss")
        });

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.get("/messages", async (req, res) => {
    const { user } = req.headers;
    const { limit } = req.query;

    try {
        const participant = await db.collection("participants").findOne({ name: user });

        if (!participant) {
            return res.sendStatus(403);
        }

        let messagesQuery = {
            $or: [
                { to: "Todos" },
                { to: user },
                { from: user }
            ]
        };

        if (limit) {
            const schema = joi.string().required().pattern(/^[1-9]\d*$/);
            const validationErrors = validateSchema(schema, limit);

            if (validationErrors) {
                return res.status(422).send(validationErrors);
            }

            const messages = await db.collection("messages").find(messagesQuery).toArray();
            const lastElements = messages.slice(-parseInt(limit));
            return res.status(200).send(lastElements);
        }

        const messages = await db.collection("messages").find(messagesQuery).toArray();
        res.status(200).send(messages);

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.post("/status", async (req, res) => {
    const { user } = req.headers;

    const schema = joi.required();
    const validationErrors = validateSchema(schema, user);

    if (validationErrors) {
        return res.status(404).send(validationErrors);
    }

    try {
        const participant = await db.collection("participants").findOne({ name: user });

        if (!participant) {
            return res.sendStatus(404);
        }

        await db.collection("participants").updateOne(
            { _id: new ObjectId(participant._id) },
            {
                $set: {
                    lastStatus: Date.now()
                }
            }
        );

        res.sendStatus(200);

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

const cleanInactiveParticipants = async () => {
    try {
        const inactiveParticipants = await db.collection("participants").find({ lastStatus: { $lt: Date.now() - 10000 } }).toArray();

        for (const participant of inactiveParticipants) {
            await db.collection("participants").deleteOne({ _id: new ObjectId(participant._id) });

            await db.collection("messages").insertOne({
                from: participant.name,
                to: "Todos",
                text: "sai da sala...",
                type: "status",
                time: dayjs().format("HH:mm:ss")
            });
        }

    } catch (err) {
        console.error("Not participants");
    }
};

setInterval(cleanInactiveParticipants, 15000);

const PORT = process.env.PORT || 5000;

async function startServer() {
    await connectToDatabase();
    app.listen(PORT, () => console.log(`Server ${PORT}`));
}

startServer();