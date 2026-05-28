<script setup lang="ts">
import { useUsersListQuery } from "~/services/users";

const { t } = useI18n();
const { data, isLoading, error } = useUsersListQuery();
</script>

<template>
  <section>
    <h1 class="mb-4 text-3xl font-bold">{{ t("users.title") }}</h1>
    <p v-if="isLoading" class="text-(--ui-text-muted)">{{ t("users.loading") }}</p>
    <p v-else-if="error" class="text-(--ui-error)">
      {{ t("users.error", { message: error.error_message || error.message }) }}
    </p>
    <ul v-else class="divide-y divide-(--ui-border)">
      <li v-for="user in data" :key="user.id" class="flex items-center justify-between py-2">
        <div>
          <span class="font-medium">{{ user.name }}</span>
          <span class="ml-2 text-sm text-(--ui-text-muted)">{{ user.email }}</span>
        </div>
        <Badge variant="secondary">#{{ user.id }}</Badge>
      </li>
    </ul>
  </section>
</template>
