import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import {
  BoardPin,
  ReorderInstruction,
  ShuffleRun,
  ShuffleStore
} from "@pinshuffle/core";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS boards (
    board_id TEXT PRIMARY KEY,
    board_url TEXT NOT NULL,
    pin_count INTEGER DEFAULT 0,
    last_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS pins (
    pin_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    image_url TEXT,
    description TEXT,
    dominant_color TEXT,
    link TEXT,
    created_at TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (pin_id, board_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pins_board ON pins (board_id, sequence)`,
  `CREATE TABLE IF NOT EXISTS shuffle_runs (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    board_url TEXT NOT NULL,
    strategy TEXT NOT NULL,
    seed TEXT,
    pin_count INTEGER NOT NULL,
    method TEXT NOT NULL DEFAULT 'unknown',
    result_json TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_runs_board ON shuffle_runs (board_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS pin_positions (
    run_id TEXT NOT NULL,
    pin_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    old_sequence INTEGER NOT NULL,
    new_sequence INTEGER NOT NULL,
    PRIMARY KEY (run_id, pin_id),
    FOREIGN KEY (run_id) REFERENCES shuffle_runs(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_positions_run ON pin_positions (run_id)`
];

export class SqliteShuffleStore implements ShuffleStore {
  private readonly db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ?? path.resolve(".pinshuffle", "pinshuffle.db");
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.transaction(() => {
      for (const sql of MIGRATIONS) {
        this.db.exec(sql);
      }
    })();
  }

  async saveBoardPins(boardId: string, pins: BoardPin[]): Promise<void> {
    const upsertBoard = this.db.prepare(
      `INSERT INTO boards (board_id, board_url, pin_count, last_fetched_at)
       VALUES (?, '', ?, datetime('now'))
       ON CONFLICT(board_id) DO UPDATE SET
         pin_count = excluded.pin_count,
         last_fetched_at = excluded.last_fetched_at`
    );

    const upsertPin = this.db.prepare(
      `INSERT INTO pins (pin_id, board_id, sequence, title, image_url, description, dominant_color, link, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pin_id, board_id) DO UPDATE SET
         sequence = excluded.sequence,
         title = excluded.title,
         image_url = excluded.image_url,
         description = excluded.description,
         dominant_color = excluded.dominant_color,
         link = excluded.link,
         fetched_at = datetime('now')`
    );

    this.db.transaction(() => {
      upsertBoard.run(boardId, pins.length);
      for (const pin of pins) {
        upsertPin.run(
          pin.pinId,
          pin.boardId,
          pin.sequence,
          pin.title ?? null,
          pin.imageUrl ?? null,
          pin.description ?? null,
          pin.dominantColor ?? null,
          pin.link ?? null,
          pin.createdAt ?? null
        );
      }
    })();
  }

  async getBoardPins(boardId: string): Promise<BoardPin[]> {
    const rows = this.db
      .prepare(
        `SELECT pin_id, board_id, sequence, title, image_url, description,
                dominant_color, link, created_at
         FROM pins WHERE board_id = ? ORDER BY sequence ASC`
      )
      .all(boardId) as Array<{
      pin_id: string;
      board_id: string;
      sequence: number;
      title: string | null;
      image_url: string | null;
      description: string | null;
      dominant_color: string | null;
      link: string | null;
      created_at: string | null;
    }>;

    return rows.map((r) => ({
      pinId: r.pin_id,
      boardId: r.board_id,
      sequence: r.sequence,
      title: r.title ?? undefined,
      imageUrl: r.image_url ?? undefined,
      description: r.description ?? undefined,
      dominantColor: r.dominant_color ?? undefined,
      link: r.link ?? undefined,
      createdAt: r.created_at ?? undefined
    }));
  }

  async saveShuffleRun(run: ShuffleRun): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO shuffle_runs (id, board_id, board_url, strategy, seed, pin_count, method, result_json, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           method = excluded.method,
           result_json = excluded.result_json,
           completed_at = excluded.completed_at`
      )
      .run(
        run.id,
        run.boardId,
        run.boardUrl,
        run.strategy,
        run.seed,
        run.pinCount,
        run.method,
        run.result ? JSON.stringify(run.result) : null,
        run.createdAt,
        run.completedAt ?? null
      );
  }

  async getShuffleRuns(boardId?: string): Promise<ShuffleRun[]> {
    const query = boardId
      ? this.db.prepare(
          `SELECT * FROM shuffle_runs WHERE board_id = ? ORDER BY created_at DESC`
        )
      : this.db.prepare(
          `SELECT * FROM shuffle_runs ORDER BY created_at DESC`
        );

    const rows = (boardId ? query.all(boardId) : query.all()) as Array<{
      id: string;
      board_id: string;
      board_url: string;
      strategy: string;
      seed: string | null;
      pin_count: number;
      method: string;
      result_json: string | null;
      created_at: string;
      completed_at: string | null;
    }>;

    return rows.map(rowToShuffleRun);
  }

  async getShuffleRun(runId: string): Promise<ShuffleRun | null> {
    const row = this.db
      .prepare(`SELECT * FROM shuffle_runs WHERE id = ?`)
      .get(runId) as
      | {
          id: string;
          board_id: string;
          board_url: string;
          strategy: string;
          seed: string | null;
          pin_count: number;
          method: string;
          result_json: string | null;
          created_at: string;
          completed_at: string | null;
        }
      | undefined;

    return row ? rowToShuffleRun(row) : null;
  }

  async savePinPositions(
    runId: string,
    instructions: ReorderInstruction[]
  ): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO pin_positions (run_id, pin_id, board_id, old_sequence, new_sequence)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(run_id, pin_id) DO UPDATE SET
         old_sequence = excluded.old_sequence,
         new_sequence = excluded.new_sequence`
    );

    this.db.transaction(() => {
      for (const inst of instructions) {
        stmt.run(
          runId,
          inst.pinId,
          inst.boardId,
          inst.oldSequence,
          inst.newSequence
        );
      }
    })();
  }

  async getPinPositions(runId: string): Promise<ReorderInstruction[]> {
    const rows = this.db
      .prepare(
        `SELECT pin_id, board_id, old_sequence, new_sequence
         FROM pin_positions WHERE run_id = ? ORDER BY new_sequence ASC`
      )
      .all(runId) as Array<{
      pin_id: string;
      board_id: string;
      old_sequence: number;
      new_sequence: number;
    }>;

    return rows.map((r) => ({
      pinId: r.pin_id,
      boardId: r.board_id,
      oldSequence: r.old_sequence,
      newSequence: r.new_sequence
    }));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

function rowToShuffleRun(row: {
  id: string;
  board_id: string;
  board_url: string;
  strategy: string;
  seed: string | null;
  pin_count: number;
  method: string;
  result_json: string | null;
  created_at: string;
  completed_at: string | null;
}): ShuffleRun {
  return {
    id: row.id,
    boardId: row.board_id,
    boardUrl: row.board_url,
    strategy: row.strategy as ShuffleRun["strategy"],
    seed: row.seed,
    pinCount: row.pin_count,
    method: row.method as ShuffleRun["method"],
    result: row.result_json ? JSON.parse(row.result_json) : null,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined
  };
}
