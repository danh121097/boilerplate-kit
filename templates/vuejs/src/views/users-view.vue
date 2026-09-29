<script setup lang="ts">
import { useUsersListQuery } from "@/services/users";

const { t } = useI18n();
const { data, isLoading, error } = useUsersListQuery();
</script>

<template>
  <section>
    <h1 class="mb-4 text-3xl font-bold">{{ t("users.title") }}</h1>
    <p v-if="isLoading" class="text-muted-foreground">{{ t("users.loading") }}</p>
    <p v-else-if="error" class="text-destructive">
      {{ t("users.error", { message: error.error_message || error.message }) }}
    </p>
    <p v-else-if="!data?.data.length" class="text-muted-foreground">{{ t("users.empty") }}</p>
    <ul v-else class="divide-y divide-border">
      <li v-for="user in data.data" :key="user._id" class="flex items-center justify-between py-2">
        <div>
          <span class="font-medium">{{ user.name }}</span>
          <span class="ml-2 text-sm text-muted-foreground">{{ user.email }}</span>
        </div>
        <Badge variant="secondary">#{{ user._id }}</Badge>
      </li>
    </ul>
  </section>
</template>
