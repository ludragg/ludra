<script lang="ts">
  let {
    id,
    label,
    value,
    min = 0,
    max = 200,
    onchange,
  }: {
    id: string;
    label: string;
    value: number;
    min?: number;
    max?: number;
    onchange: (value: number) => void;
  } = $props();

  const fill = $derived(((value - min) / (max - min)) * 100);
</script>

<div class="slider">
  <div class="slider__header">
    <label for={id} class="slider__label">{label}</label>
    <span class="slider__value">{value}%</span>
  </div>
  <input
    {id}
    class="slider__input"
    type="range"
    {min}
    {max}
    {value}
    style:--fill="{fill}%"
    oninput={(event) => onchange(Number(event.currentTarget.value))}
  />
</div>

<style>
  .slider {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .slider__header {
    display: flex;
    justify-content: space-between;
    font-size: var(--hint-font-size);
  }

  .slider__label {
    color: var(--body-color);
  }

  .slider__value {
    color: var(--subtle-color);
    font-variant-numeric: tabular-nums;
  }

  .slider__input {
    width: 100%;
    height: 6px;
    margin: 6px 0;
    appearance: none;
    border-radius: 3px;
    background: linear-gradient(to right, var(--brand-color) var(--fill), rgba(255, 255, 255, 0.08) var(--fill));
    cursor: pointer;
  }

  .slider__input::-webkit-slider-thumb {
    width: 16px;
    height: 16px;
    appearance: none;
    border-radius: 50%;
    background: var(--muted-color);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }
</style>
