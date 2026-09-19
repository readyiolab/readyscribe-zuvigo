-- CreateTable
CREATE TABLE `extension_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(100) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `extension_tokens_token_key`(`token`),
    INDEX `extension_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `extension_handoffs` (
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `token` VARCHAR(64) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `extension_handoffs_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `extension_tokens` ADD CONSTRAINT `extension_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
