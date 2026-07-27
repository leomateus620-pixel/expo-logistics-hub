import {
  Building2,
  Clock3,
  MapPin,
  Plus,
  Settings2,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VenueSpace } from "@/lib/venue-operations";

function openingHours(space: VenueSpace) {
  const start =
    typeof space.standard_opening_hours.daily_start === "string"
      ? space.standard_opening_hours.daily_start
      : "08:00";
  const end =
    typeof space.standard_opening_hours.daily_end === "string"
      ? space.standard_opening_hours.daily_end
      : "22:00";
  return `${start}–${end}`;
}

export function VenueSpaceManagementPanel({
  spaces,
  canManage,
  onCreate,
  onEdit,
}: {
  spaces: VenueSpace[];
  canManage: boolean;
  onCreate: () => void;
  onEdit: (space: VenueSpace) => void;
}) {
  const orderedSpaces = [...spaces].sort((left, right) => {
    if (Boolean(left.parent_space_id) !== Boolean(right.parent_space_id)) {
      return left.parent_space_id ? 1 : -1;
    }
    return left.name.localeCompare(right.name, "pt-BR");
  });

  return (
    <section className="venue-panel venue-space-management">
      <header className="venue-panel__header">
        <div>
          <p className="venue-eyebrow">Configuração operacional</p>
          <h2>Restaurante, Arena e subáreas</h2>
          <p>
            Capacidade, janelas e restrições são regras canônicas usadas na
            agenda.
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={onCreate}>
            <Plus aria-hidden="true" />
            Novo espaço
          </Button>
        )}
      </header>

      <div className="venue-space-management__grid">
        {orderedSpaces.map((space) => {
          const subareas = spaces.filter(
            (item) => item.parent_space_id === space.id,
          );
          const parent = space.parent_space_id
            ? spaces.find((item) => item.id === space.parent_space_id)
            : null;
          return (
            <article key={space.id} data-active={space.active}>
              <header>
                <span aria-hidden="true">
                  <Building2 />
                </span>
                <div>
                  <h3>{space.name}</h3>
                  <p>
                    {parent ? `Subárea de ${parent.name}` : null}
                    {parent && space.description ? " · " : null}
                    {space.description ||
                      (!parent ? "Espaço operacional Fenasoja" : null)}
                  </p>
                </div>
                <Badge variant={space.active ? "secondary" : "outline"}>
                  {space.active ? "Ativo" : "Inativo"}
                </Badge>
              </header>

              <dl>
                <div>
                  <dt>
                    <UsersRound aria-hidden="true" />
                    Capacidade
                  </dt>
                  <dd>
                    {space.capacity
                      ? `${space.capacity.toLocaleString("pt-BR")} pessoas`
                      : "A definir"}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Clock3 aria-hidden="true" />
                    Horário padrão
                  </dt>
                  <dd>{openingHours(space)}</dd>
                </div>
                <div>
                  <dt>
                    <MapPin aria-hidden="true" />
                    Localização
                  </dt>
                  <dd>{space.location || "Não informada"}</dd>
                </div>
              </dl>

              <div className="venue-space-management__meta">
                <span>
                  {space.available_areas.length} área(s) ·{" "}
                  {space.available_resources.length} recurso(s)
                </span>
                <span>
                  Montagem {space.required_setup_minutes} min · desmontagem{" "}
                  {space.required_teardown_minutes} min
                </span>
                {subareas.length > 0 && (
                  <span>
                    Subáreas: {subareas.map((item) => item.name).join(", ")}
                  </span>
                )}
              </div>

              {canManage && (
                <Button variant="ghost" onClick={() => onEdit(space)}>
                  <Settings2 aria-hidden="true" />
                  Configurar espaço
                </Button>
              )}
            </article>
          );
        })}
      </div>

      {!orderedSpaces.length && (
        <div className="venue-empty-compact">
          Nenhum espaço principal cadastrado para esta organização.
        </div>
      )}
    </section>
  );
}
