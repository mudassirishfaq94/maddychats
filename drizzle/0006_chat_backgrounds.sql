-- Add background_style column to conversations table for chat background customization
ALTER TABLE "conversations" ADD COLUMN "background_style" text;

-- Update the enum to include the new column reference
