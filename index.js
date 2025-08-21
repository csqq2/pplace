const express = require('express');
const { WebSocketServer } = require('ws');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(cors());

// PostgreSQLデータベースの設定
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// WebSocketサーバーのセットアップ
const server = app.listen(process.env.PORT || 8000, () => {
  console.log(`Server started on port ${server.address().port}`);
});

const wss = new WebSocketServer({ server });

// データベースの初期化
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pixels (
      id SERIAL PRIMARY KEY,
      x INT NOT NULL,
      y INT NOT NULL,
      color VARCHAR(7) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('Database initialized successfully.');
}

initDb();

// 全クライアントにブロードキャストするヘルパー関数
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', async ws => {
  console.log('New client connected!');

  // 接続時に全てのピクセルデータを送信
  try {
    const result = await pool.query('SELECT x, y, color FROM pixels');
    ws.send(JSON.stringify({ type: 'initial', data: result.rows }));
  } catch (err) {
    console.error('Error fetching initial data:', err);
  }

  ws.on('message', async message => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'update_pixel') {
        const { x, y, color } = data;

        // データベースにピクセルを保存または更新
        await pool.query(
          `INSERT INTO pixels (x, y, color) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (x, y) DO UPDATE SET color = $3`,
          [x, y, color]
        );

        // 他のクライアントに更新をブロードキャスト
        broadcast({ type: 'pixel_updated', data: { x, y, color } });
      }
    } catch (err) {
      console.error('Failed to parse message or update pixel:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected.');
  });
});
