import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import dotenv from 'dotenv';

dotenv.config();

import { initializeApp } from "firebase/app";
import { getDatabase, ref, update, get, child , set, remove } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const firebase= initializeApp(firebaseConfig);
const database= getDatabase(firebase);

const port = process.env.PORT || 5000;

const app = express();
app.locals.pitOpenTime= 60;
app.locals.controlPage= 1;

app.use(express.json());
app.use(cors());

// Game details and state variables
app.locals.gameDetails={
    gameId:0,
    gameName:"", // Added gameName
    team1:{id:"",name:"",leader:"",score:"",logo:""},
    team2:{id:"",name:"",leader:"",score:"",logo:""},
    team3:{id:"",name:"",leader:"",score:"",logo:""} // Added team3
};
app.locals.team2={};

// Timer variables
app.locals.mainTime=0;
app.locals.mainTimeRunner=0;
app.locals.mainTimer;

// Game outcome variables
app.locals.winnerId=0; // Changed from null to 0
app.locals.gameStatus="deactive"; // Three states: "active", "shown", "deactive"
app.locals.gameStatusTimer=null;

// Draw variables (NEW)
app.locals.isDraw=false;
app.locals.drawTimer=null;

// Pit timer variables
app.locals.pitTime=0;
app.locals.pitTimeRunner=0;
app.locals.pitTimer;

function mainCountdown(){
    if (app.locals.mainTimeRunner==0){
        clearInterval(app.locals.mainTimer);
    }else{
        app.locals.mainTimeRunner--;
        if(app.locals.mainTimeRunner<=app.locals.pitOpenTime){
            writePitOpen(true);
        }
    }
    console.log(app.locals.mainTimeRunner);
}

function pitCountdown(){
    if (app.locals.pitTimeRunner==0){
        clearInterval(app.locals.pitTimer);
    }else{
        app.locals.pitTimeRunner--;
    }
    console.log(app.locals.pitTimeRunner);
}

// Game status functions - Three states: "active", "shown", "deactive"
function setGameStatusActive(){
    console.log("Game status set to ACTIVE");
    app.locals.gameStatus = "active";
    writeGameStatus("active");
}

function setGameStatusShown(){
    console.log("Game status set to SHOWN");
    app.locals.gameStatus = "shown";
    writeGameStatus("shown");
}

function setGameStatusDeactive(){
    console.log("Game status set to DEACTIVE");
    app.locals.gameStatus = "deactive";
    writeGameStatus("deactive");
    if(app.locals.gameStatusTimer){
        clearTimeout(app.locals.gameStatusTimer);
        app.locals.gameStatusTimer = null;
    }
}

function scheduleGameStatusActivation(){
    // Clear any existing timer
    if(app.locals.gameStatusTimer){
        clearTimeout(app.locals.gameStatusTimer);
    }
    
    // Set timer to activate game status after 30 seconds
    app.locals.gameStatusTimer = setTimeout(setGameStatusActive, 30000);
    console.log("Game status scheduled to activate in 30 seconds");
}

function activateGameStatusWithAutoDeactivation(){
    console.log("Game status shown with auto-deactivation");
    setGameStatusShown();
    
    // Clear any existing timer
    if(app.locals.gameStatusTimer){
        clearTimeout(app.locals.gameStatusTimer);
    }
    
    // Set timer to deactivate game status after 30 seconds
    app.locals.gameStatusTimer = setTimeout(() => {
        setGameStatusDeactive();
        console.log("Game status auto-deactivated after 30 seconds");
    }, 30000);
}

// Legacy function names for backward compatibility
function activateGameStatus(){
    setGameStatusActive();
}

function deactivateGameStatus(){
    setGameStatusDeactive();
}

// Draw functions (NEW) - Updated with auto-deactivation
function activateDraw(){
    console.log("Draw status activated with auto-deactivation");
    app.locals.isDraw = true;
    app.locals.gameStatus = "shown"; // Set game status to shown for draw
    writeDraw(true);
    writeGameStatus("shown");
    
    // Clear any existing timer
    if(app.locals.drawTimer){
        clearTimeout(app.locals.drawTimer);
    }
    
    // Set timer to deactivate draw after 30 seconds
    app.locals.drawTimer = setTimeout(() => {
        deactivateDrawAndGameStatus();
        console.log("Draw auto-deactivated after 30 seconds");
    }, 30000);
}

function deactivateDrawAndGameStatus(){
    console.log("Draw and game status deactivated");
    app.locals.isDraw = false;
    app.locals.gameStatus = "deactive"; // Set game status to deactive
    writeDraw(false);
    writeGameStatus("deactive");
    if(app.locals.drawTimer){
        clearTimeout(app.locals.drawTimer);
        app.locals.drawTimer = null;
    }
}

function deactivateDraw(){
    console.log("Draw status deactivated");
    app.locals.isDraw = false;
    writeDraw(false);
    if(app.locals.drawTimer){
        clearTimeout(app.locals.drawTimer);
        app.locals.drawTimer = null;
    }
}

function scheduleDrawActivation(){
    // Clear any existing timer
    if(app.locals.drawTimer){
        clearTimeout(app.locals.drawTimer);
    }
    
    // Set timer to activate draw immediately (change to 30000 for 30 seconds delay)
    app.locals.drawTimer = setTimeout(activateDraw, 0);
    console.log("Draw scheduled to activate immediately with auto-deactivation");
}

// API Endpoints
app.post("/setMain", (req, res) =>{
    app.locals.mainTime= req.body.mainTime;
    app.locals.mainTimeRunner= app.locals.mainTime;
    console.log(app.locals.mainTimeRunner);
    writePitOpen(false);
    res.end();
});

app.post("/setPit", (req, res) =>{
    const details= req.body;
    app.locals.pitTime= details.pitTime;
    app.locals.pitTimeRunner= app.locals.pitTime;
    console.log(app.locals.pitTimeRunner);
    res.end();
});

app.post("/setPitOpen", (req, res) =>{
    const details= req.body;
    app.locals.pitOpenTime= details.pitOpenTime;
    res.end();
});

app.post("/setGameDetails",async (req,res)=>{
    const details= req.body;
    app.locals.gameDetails.team1= await getTeamDetails(details.team1);
    app.locals.gameDetails.team2= await getTeamDetails(details.team2);
    app.locals.gameDetails.team3= details.team3 ? await getTeamDetails(details.team3) : {id:"",name:"",leader:"",score:"",logo:""}; // Added team3
    app.locals.gameDetails.gameId=details.gameId;
    app.locals.gameDetails.gameName=details.gameName || ""; // Store gameName
    app.locals.winnerId=0;

    deactivateDraw();
    setGameStatusActive();

    res.end();
})

app.post("/startMain", (req, res) =>{
    clearInterval(app.locals.mainTimer);
    if(app.locals.pitOpenTime<app.locals.mainTimeRunner){
        writePitOpen(false);
    }
    app.locals.mainTimer = setInterval(mainCountdown, 1000);
    res.end();
});

app.post("/startPit", (req, res) =>{
    clearInterval(app.locals.pitTimer);
    app.locals.pitTimer = setInterval(pitCountdown, 1000);
    res.end();
});

app.post("/stopMain",(req,res)=>{
    clearInterval(app.locals.mainTimer);
    app.locals.mainTimer = null;
    res.end();
})

app.post("/stopPit",(req,res)=>{
    clearInterval(app.locals.pitTimer);
    res.end();
})

app.put("/resetMain",(req,res)=>{
    clearInterval(app.locals.mainTimer);
    app.locals.mainTimer = null;
    app.locals.mainTimeRunner=app.locals.mainTime;
    writePitOpen(false);
    res.end();
})

app.put("/resetPit",(req,res)=>{
    clearInterval(app.locals.pitTimer);
    app.locals.pitTimeRunner=app.locals.pitTime;
    res.end();
})

// Updated timer endpoint with draw status
app.get('/timer', (req, res) => {
    res.writeHead(200,{
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    })
    res.write('timer connected');

    setInterval(() => {
        const data = { 
            mainTime: `${app.locals.mainTimeRunner}`, 
            pitTime: `${app.locals.pitTimeRunner}`, 
            gameStatus: app.locals.gameStatus,
            isDraw: app.locals.isDraw
        };
        if (app.locals.gameStatus !== "deactive") {
            data.gameId = `${app.locals.gameDetails.gameId}`;
            data.gameName = `${app.locals.gameDetails.gameName}`; // Added gameName
            data.team1Id = `${app.locals.gameDetails.team1.id}`;
            data.team2Id = `${app.locals.gameDetails.team2.id}`;
            data.team3Id = `${app.locals.gameDetails.team3.id}`;
            data.winnerId = `${app.locals.winnerId}`;
        } else {
            data.gameId = "";
            data.gameName = ""; // Added gameName
            data.team1Id = "";
            data.team2Id = "";
            data.team3Id = "";
            data.winnerId = "";
        }
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }, 1000);
    
    req.on('close', () => res.end('OK'))
});

app.get("/gameId", (req,res)=>{
    res.writeHead(200,{
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    })
    res.write('timer connected'); 

    setInterval(() => {
        // Send gameId when status is "active" OR "shown" (including draws)
        // Only hide when status is "deactive"
        const gameId = (app.locals.gameStatus !== "deactive") ? app.locals.gameDetails.gameId : 0;
        const data = { gameId: `${gameId}` };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }, 1000);
    
    req.on('close', () => res.end('OK'))
})

app.get("/nextGameId", async (req,res)=>{
    const body= await getGameCount();
    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify(body));
    res.end();
})

app.get("/getGameDetails", (req,res)=>{
    let body;
    if (app.locals.gameStatus !== "deactive") {
        body = app.locals.gameDetails;
    } else {
        body = {
            gameId: 0,
            gameName: "", // Added gameName
            team1: {id:"", name:"", leader:"", score:"", logo:""},
            team2: {id:"", name:"", leader:"", score:"", logo:""},
            team3: {id:"", name:"", leader:"", score:"", logo:""} // Added team3
        };
    }
    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify(body));
    res.end();
})

app.get("/teams", async(req,res)=>{
    const body= await getTeams();
    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify(body));
    res.end();
})

app.get("/games", async(req,res)=>{
    const body= await getAllGames();
    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify(body));
    res.end();
})

app.post("/saveGame", async(req,res)=>{
    const content  = req.body;
    // If content.team3name/team3score exist, pass them
    const body= await saveGame(
        app.locals.gameDetails.gameId,
        app.locals.gameDetails.team1.name,
        app.locals.gameDetails.team2.name,
        content.team1score,
        content.team2score,
        app.locals.gameDetails.team3.name,
        content.team3score
    );
    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify(body));
    res.end();
})

// Team management endpoints
async function addTeamDetails(team) {
    if (!team || !team.id) {
        return { message: "Invalid team data" };
    }
    try {
        await set(ref(database, `teams/${team.id}`), {
            name: team.name || "",
            leader: team.leader || "",
            logo: team.logo || "",
            points: team.points || 0
        });
        return { message: "Team added successfully" };
    } catch (error) {
        console.error(error);
        return { message: "Failed to add team" };
    }
}

app.post("/addTeam", async (req, res) => {
    const team = req.body;
    const result = await addTeamDetails(team);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify(result));
    res.end();
});

async function deleteTeam(teamId) {
    if (!teamId) {
        return { message: "Invalid team ID" };
    }
    try {
        await remove(ref(database, `teams/${teamId}`));
        return { message: "Team deleted successfully" };
    } catch (error) {
        console.error(error);
        return { message: "Failed to delete team" };
    }
}

app.delete("/deleteTeam/:id", async (req, res) => {
    const teamId = req.params.id;
    const result = await deleteTeam(teamId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify(result));
    res.end();
});

// Database write functions
function writePitOpen(stat){
    update(ref(database,'/'),{
        pitopen: stat
    });
}

function writeGameStatus(status){
    update(ref(database,'/'),{
        gameStatus: status // Now accepts "active", "shown", or "deactive"
    });
}

function writeDraw(status){
    update(ref(database,'/'),{
        isDraw: status
    });
}

// Status endpoints
async function getPitStatus() {
    const dbRef = ref(database);
    try {
        const snapshot = await get(child(dbRef, 'pitopen'));
        if (snapshot.exists()) {
            return { pitopen: snapshot.val() };
        } else {
            return { pitopen: null };
        }
    } catch (error) {
        console.error(error);
        return { pitopen: null };
    }
}

app.get("/pitstatus", async (req, res) => {
    const status = await getPitStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify(status));
    res.end();
});

app.get("/timerstatus", (req, res) => {
    const mainRunning = !!app.locals.mainTimer && !isNaN(app.locals.mainTimeRunner) && app.locals.mainTimeRunner > 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ mainRunning }));
    res.end();
});

// Game status endpoints - Three states: "active", "shown", "deactive"
app.post("/setGameStatusActive", (req, res) => {
    setGameStatusActive();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ message: "Game status set to ACTIVE", gameStatus: app.locals.gameStatus }));
    res.end();
});

app.post("/setGameStatusShown", (req, res) => {
    setGameStatusShown();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ message: "Game status set to SHOWN", gameStatus: app.locals.gameStatus }));
    res.end();
});

app.post("/setGameStatusDeactive", (req, res) => {
    setGameStatusDeactive();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ message: "Game status set to DEACTIVE", gameStatus: app.locals.gameStatus }));
    res.end();
});

// Legacy endpoints for backward compatibility
app.post("/activateGameStatus", (req, res) => {
    activateGameStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ message: "Game status activated (legacy)", gameStatus: app.locals.gameStatus }));
    res.end();
});

app.post("/deactivateGameStatus", (req, res) => {
    deactivateGameStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ message: "Game status deactivated (legacy)", gameStatus: app.locals.gameStatus }));
    res.end();
});

app.get("/gameStatus", (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ 
        gameStatus: app.locals.gameStatus,
        availableStates: ["active", "shown", "deactive"]
    }));
    res.end();
});

// Draw status endpoints (NEW)
app.post("/activateDraw", (req, res) => {
    activateDraw();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ message: "Draw activated" }));
    res.end();
});

app.post("/deactivateDraw", (req, res) => {
    deactivateDraw();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ message: "Draw deactivated" }));
    res.end();
});

app.get("/drawStatus", (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ isDraw: app.locals.isDraw }));
    res.end();
});

app.post("/deactivateDrawAndGameStatus", (req, res) => {
    deactivateDrawAndGameStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write(JSON.stringify({ 
        message: "Draw and game status deactivated", 
        isDraw: app.locals.isDraw,
        gameStatus: app.locals.gameStatus 
    }));
    res.end();
});

// Database helper functions
async function getGameCount(){
    const dbRef = ref(database);
    return await get(child(dbRef, `games`)).then((snapshot) => {
    if (snapshot.exists()) {
        let count= snapshot.size +1
        return {gameId:count};
    } else {
        console.log("No data available");
        return {gameId:""}
    }
    }).catch((error) => {
        console.error(error);
        return {gameId:""}
    });
}

async function getTeamDetails(teamid){
    const dbRef = ref(database);
    console.log(teamid)
    return await get(child(dbRef, `teams/${teamid}`)).then((snapshot) => {
    if (snapshot.exists()) {
        let team= snapshot.val();
        team={id:teamid,name:team.name,leader:team.leader,score:"",logo:team.logo}
        console.log(team)
        return team;
    } else {
        console.log("No data available");
        return {id:"",name:"",leader:"",score:"",logo:""}
    }
    }).catch((error) => {
        console.error(error);
        return {id:"",name:"",leader:"",score:"",logo:""}
    });
    
}

async function getTeams(){
    const dbRef = ref(database);
    return await get(child(dbRef, `teams/`)).then((snapshot) => {
    if (snapshot.exists()) {
        return snapshot.val();
    } else {
        console.log("No data available");
        return {}
    }
    }).catch((error) => {
        console.error(error);
        return {}
    });
}

async function getAllGames(){
    const dbRef = ref(database);
    return await get(child(dbRef, `games/`)).then((snapshot) => {
    if (snapshot.exists()) {
        return snapshot.val();
    } else {
        console.log("No data available");
        return {}
    }
    }).catch((error) => {
        console.error(error);
        return {}
    });
}

// Updated saveGame function with 3 team match support
async function saveGame(gameId, team1name, team2name, team1score, team2score, team3name, team3score){
    console.log(
        `Game Summary:\n` +
        `  Game ID: ${gameId}\n` +
        `  Team 1: ${team1name} (ID: ${app.locals.gameDetails.team1.id}) - Score: ${team1score}\n` +
        `  Team 2: ${team2name} (ID: ${app.locals.gameDetails.team2.id}) - Score: ${team2score}`
    );
    
    // If team3name/team3score are not provided, fallback to 2-team logic
    const isThreeTeam = team3name !== undefined && team3score !== undefined && team3name !== "" && team3score !== "";
    const gameName = app.locals.gameDetails.gameName || ""; // Get gameName
    if(gameId && team1name && team2name && team1score != null && team2score != null && (!isThreeTeam || (team3name && team3score != null))){
        const t1score = Number(team1score);
        const t2score = Number(team2score);
        const t3score = isThreeTeam ? Number(team3score) : null;
        let winnerId = 0;
        let winnerMsg = "";
        
        if(isThreeTeam){
            // 3 team match logic
            const scores = [
                {id: app.locals.gameDetails.team1.id, name: team1name, score: t1score},
                {id: app.locals.gameDetails.team2.id, name: team2name, score: t2score},
                {id: app.locals.gameDetails.team3.id, name: team3name, score: t3score}
            ];
            const maxScore = Math.max(t1score, t2score, t3score);
            const winners = scores.filter(t => t.score === maxScore);
            if(winners.length === 1){
                winnerId = winners[0].id;
                app.locals.winnerId = winnerId;
                await postWinnerPoints(winnerId, 3);
                winnerMsg = `Winner: ${winners[0].name} (ID: ${winnerId})`;
                deactivateDraw();
                activateGameStatusWithAutoDeactivation();
            }else{
                // Draw between two or three teams
                winnerId = 0;
                app.locals.winnerId = 0;
                winnerMsg = "It's a draw. No winner.";
                deactivateGameStatus();
                scheduleDrawActivation();
            }
            await set(ref(database, 'games/' + (gameId - 1)), {
                gameid: "" + gameId,
                gameName: gameName, // Save gameName
                team1name: "" + team1name,
                team1score: "" + team1score,
                team2name: "" + team2name,
                team2score: "" + team2score,
                team3name: "" + team3name,
                team3score: "" + team3score,
                winnerId: winnerId,
                isDraw: winnerId === 0
            });
        }else{
            // ...existing 2-team logic...
            if(t1score > t2score){
                winnerId = app.locals.gameDetails.team1.id;
                app.locals.winnerId = winnerId;
                await postWinnerPoints(winnerId, 3);
                winnerMsg = `Winner: ${app.locals.gameDetails.team1.name} (ID: ${winnerId})`;
                deactivateDraw();
                activateGameStatusWithAutoDeactivation();
            } else if(t2score > t1score){
                winnerId = app.locals.gameDetails.team2.id;
                app.locals.winnerId = winnerId;
                await postWinnerPoints(winnerId, 3);
                winnerMsg = `Winner: ${app.locals.gameDetails.team2.name} (ID: ${winnerId})`;
                deactivateDraw();
                activateGameStatusWithAutoDeactivation();
            } else {
                winnerId = 0;
                app.locals.winnerId = 0;
                winnerMsg = "It's a draw. No winner.";
                deactivateGameStatus();
                scheduleDrawActivation();
            }
            await set(ref(database, 'games/' + (gameId - 1)), {
                gameid: "" + gameId,
                gameName: gameName, // Save gameName
                team1name: "" + team1name,
                team1score: "" + team1score,
                team2name: "" + team2name,
                team2score: "" + team2score,
                winnerId: winnerId,
                isDraw: winnerId === 0
            });
        }
        console.log(winnerMsg);
        return { message: "Saved Scores Successfully" };
    } else {
        return { message: "Game details not set!" };
    }
}

// Helper to update winner's points in the database
async function postWinnerPoints(teamId, pointsToAdd) {
    if (!teamId) return;
    const dbRef = ref(database);
    const teamRef = child(dbRef, `teams/${teamId}`);
    let currentPoints = 0;
    try {
        const snapshot = await get(teamRef);
        if (snapshot.exists()) {
            const team = snapshot.val();
            currentPoints = parseInt(team.points || 0, 10);
        }
    } catch (e) {
        currentPoints = 0;
    }
    await update(ref(database, `teams/${teamId}`), {
        points: currentPoints + pointsToAdd
    });
}

// Image upload functionality
const upload = multer();
const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY;

app.post('/api/upload-logo', upload.single('logo'), async (req, res) => {
  try {
    const formData = new FormData();
    formData.append('source', req.file.buffer, { filename: req.file.originalname });
    formData.append('type', 'file');
    formData.append('key', FREEIMAGE_API_KEY);

    const response = await fetch('https://freeimage.host/api/1/upload', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, ()=> {console.log(`Server started on port ${port}`)})