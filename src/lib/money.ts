const formatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
});

export function formatCLP(n: number): string {
  return formatter.format(n);
}
