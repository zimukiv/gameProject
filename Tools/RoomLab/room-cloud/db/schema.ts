import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
export const branches = sqliteTable("branches", {
  workspace: text("workspace").notNull(),
  name: text("name").notNull(),
  head: text("head"),
  updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({columns: [t.workspace, t.name]})]);
export const revisions = sqliteTable("revisions", {
  workspace: text("workspace").notNull(),
  id: text("id").notNull(),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
}, t => [primaryKey({columns: [t.workspace, t.id]})]);
export const chunks = sqliteTable("chunks", {
  workspace: text("workspace").notNull(),
  hash: text("hash").notNull(),
  size: integer("size").notNull(),
}, t => [primaryKey({columns: [t.workspace,t.hash]})]);
export const liveSessions = sqliteTable("live_sessions", {
 workspace:text("workspace").notNull(), channel:text("channel").notNull(), device:text("device").notNull(), seen:integer("seen").notNull(),
},t=>[primaryKey({columns:[t.workspace,t.channel,t.device]})]);
export const liveDrafts = sqliteTable("live_drafts", {
 workspace:text("workspace").notNull(), channel:text("channel").notNull(), seq:integer("seq").notNull(), data:text("data").notNull(), updatedAt:integer("updated_at").notNull(),
},t=>[primaryKey({columns:[t.workspace,t.channel]})]);
export const nodeMetadata = sqliteTable("node_metadata", {
 workspace:text("workspace").notNull(), revisionId:text("revision_id").notNull(), parentId:text("parent_id"), deletedAt:integer("deleted_at"), updatedAt:integer("updated_at").notNull(),
},t=>[primaryKey({columns:[t.workspace,t.revisionId]})]);
export const workspaceGraph = sqliteTable("workspace_graph", {
 workspace:text("workspace").primaryKey(), generation:integer("generation").notNull(), operationId:text("operation_id").notNull(),
});
