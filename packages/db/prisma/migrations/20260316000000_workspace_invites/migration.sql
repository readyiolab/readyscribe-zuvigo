-- CreateTable
CREATE TABLE `workspace_invites` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'EDITOR', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'EDITOR',
    `token` VARCHAR(64) NOT NULL,
    `invitedByUserId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workspace_invites_token_key`(`token`),
    INDEX `workspace_invites_workspaceId_email_idx`(`workspaceId`, `email`),
    INDEX `workspace_invites_token_revokedAt_idx`(`token`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `workspace_invites` ADD CONSTRAINT `workspace_invites_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_invites` ADD CONSTRAINT `workspace_invites_invitedByUserId_fkey` FOREIGN KEY (`invitedByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
