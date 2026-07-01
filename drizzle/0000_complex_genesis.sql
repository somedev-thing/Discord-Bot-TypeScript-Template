CREATE TABLE "moderation_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"duration_seconds" integer,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"note" text NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"mod_log_channel_id" text,
	"mute_role_id" text,
	"appeal_url" text,
	"dm_punishments" boolean DEFAULT true NOT NULL,
	"reason_prompts" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_temporary_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"case_id" integer,
	"reason" text NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
