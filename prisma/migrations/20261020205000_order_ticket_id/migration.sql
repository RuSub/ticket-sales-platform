-- AlterTable
ALTER TABLE "orders" ADD COLUMN "ticket_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_ticket_id_key" ON "orders"("ticket_id");
