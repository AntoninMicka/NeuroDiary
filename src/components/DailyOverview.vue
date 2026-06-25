<script setup>
const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["patch-entry"]);

function patchEntry(field, value) {
  emit("patch-entry", {
    [field]: value,
  });
}
</script>

<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Denni zaznam</p>
        <h2>Prehled dne</h2>
      </div>
    </div>

    <form class="day-form">
      <label>
        <span>Kvalita spanku</span>
        <select
          :value="props.modelValue.sleepQuality"
          @input="patchEntry('sleepQuality', $event.target.value)"
        >
          <option value="poor">Spatna</option>
          <option value="mixed">Promenliva</option>
          <option value="good">Dobra</option>
        </select>
      </label>

      <label>
        <span>Celkovy den</span>
        <select
          :value="props.modelValue.overallStatus"
          @input="patchEntry('overallStatus', $event.target.value)"
        >
          <option value="hard">Narocny den</option>
          <option value="stable">Stabilni den</option>
          <option value="good">Dobry den</option>
        </select>
      </label>

      <label class="notes-field">
        <span>Poznamky</span>
        <textarea
          :value="props.modelValue.notes"
          rows="4"
          placeholder="Napriklad: ztuhlost po obede, tres lepsi po prochazce..."
          @input="patchEntry('notes', $event.target.value)"
        />
      </label>
    </form>
  </section>
</template>
