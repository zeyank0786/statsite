declare module 'better-sqlite3' {
  export default class Database {
    constructor(filename: string, options?: any);
    prepare(sql: string): Statement;
    exec(sql: string): Database;
    transaction(fn: () => void): () => void;
    close(): void;
  }

  export interface Statement {
    run(...params: any[]): any;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }
}
