import { useEffect, useRef, useState } from "react";
import { LockKeyhole, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VolunteerPhotoPicker } from "./VolunteerPhotoPicker";
import type {
  SavedVolunteer,
  TeamContact,
  VolunteerInput,
  VolunteerPhoto,
} from "./types";
import type { PersonSummary } from "@/features/commission-agenda/types";

export const EMAIL_PRIVACY =
  "O e-mail é visível apenas para os administradores e os responsáveis autorizados desta equipe.";
export interface VolunteerFormProps {
  unitName: string;
  person?: PersonSummary;
  contact?: TeamContact;
  onClose: () => void;
  onSaved: (id: string) => void;
  save: (input: VolunteerInput) => Promise<SavedVolunteer>;
  savePhoto: (
    personId: string,
    version: number,
    photo: VolunteerPhoto | null,
    requestId: string,
  ) => Promise<{ version: number }>;
  requestAccess: (personId: string) => Promise<unknown>;
}
export function VolunteerForm({
  unitName,
  person,
  contact,
  onClose,
  onSaved,
  save,
  savePhoto,
  requestAccess,
}: VolunteerFormProps) {
  const [name, setName] = useState(person?.name ?? ""),
    [email, setEmail] = useState(contact?.email ?? "");
  const [photo, setPhoto] = useState<VolunteerPhoto | null | undefined>(
    undefined,
  );
  const [invite, setInvite] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
  }>({});
  const [notice, setNotice] = useState("");
  const [cropping, setCropping] = useState(false);
  const [viewport, setViewport] = useState<{
    height: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const resize = () =>
      setViewport({ height: visual.height, top: visual.offsetTop });
    resize();
    visual.addEventListener("resize", resize);
    visual.addEventListener("scroll", resize);
    return () => {
      visual.removeEventListener("resize", resize);
      visual.removeEventListener("scroll", resize);
    };
  }, []);
  const nameRef = useRef<HTMLInputElement>(null),
    sending = useRef(false);
  const requestId = useRef(crypto.randomUUID()),
    photoRequestId = useRef(crypto.randomUUID());
  const persisted = useRef<SavedVolunteer | null>(
    person && contact
      ? {
          person_id: person.personId ?? person.id,
          membership_id: contact.membership_id,
          version: contact.version,
        }
      : null,
  );
  const savedFields = useRef(
    JSON.stringify([person?.name ?? "", contact?.email ?? ""]),
  );
  const dirty =
    JSON.stringify([name, email]) !== savedFields.current ||
    photo !== undefined ||
    invite;
  const mayEditIdentity = !person || contact?.can_edit_identity !== false;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => {
    if (
      !busy &&
      (!dirty || window.confirm("Descartar as alterações ainda não salvas?"))
    )
      onClose();
  };
  const submit = async (another: boolean) => {
    if (sending.current || cropping) return;
    const errors = {
      name:
        name.trim().length < 2 || name.trim().length > 160
          ? "Informe o nome completo (2 a 160 caracteres)."
          : undefined,
      email:
        !/^\S+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        email.trim().length > 254
          ? "Informe um e-mail válido."
          : undefined,
    };
    setFieldErrors(errors);
    setError("");
    setNotice("");
    if (errors.name || errors.email) {
      (errors.name
        ? nameRef.current
        : document.getElementById("volunteer-email")
      )?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const fields = JSON.stringify([name, email]);
      if (!persisted.current || fields !== savedFields.current) {
        const result = await save({
          name: name.trim(),
          email: email.trim(),
          requestId: requestId.current,
          personId: persisted.current?.person_id,
          expectedVersion: persisted.current?.version,
        });
        persisted.current = result;
        savedFields.current = fields;
        requestId.current = crypto.randomUUID();
      }
      const result = persisted.current!;
      if (photo !== undefined) {
        try {
          const updated = await savePhoto(
            result.person_id,
            result.version,
            photo,
            photoRequestId.current,
          );
          result.version = updated.version;
          setPhoto(undefined);
          photoRequestId.current = crypto.randomUUID();
        } catch {
          throw new Error(
            "O cadastro está salvo. A foto não foi atualizada; mantenha este formulário aberto e tente salvar novamente.",
          );
        }
      }
      if (invite) {
        try {
          await requestAccess(result.person_id);
          setInvite(false);
        } catch {
          throw new Error(
            "O cadastro está salvo. Não foi possível solicitar o acesso. Tente novamente ou use Convidar para acessar na equipe.",
          );
        }
      }
      onSaved(result.person_id);
      if (another) {
        setName("");
        setEmail("");
        setPhoto(undefined);
        setInvite(false);
        persisted.current = null;
        savedFields.current = JSON.stringify(["", ""]);
        setNotice("Voluntário salvo. Pode cadastrar a próxima pessoa.");
        requestAnimationFrame(() => nameRef.current?.focus());
      } else onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível salvar. Seus dados foram mantidos.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="vt-dialog"
        viewportStyle={
          viewport
            ? { height: viewport.height, top: viewport.top, bottom: "auto" }
            : undefined
        }
        style={
          viewport
            ? { maxHeight: `min(52rem, ${viewport.height - 24}px)` }
            : undefined
        }
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {person ? "Editar voluntário" : "Adicionar voluntário"}
          </DialogTitle>
          <DialogDescription>
            Um cadastro para a equipe, o Ecossistema e a Agenda.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="vt-form"
        >
          <div className="vt-form__body">
            <div className="vt-destination">
              <span>Equipe de destino</span>
              <strong>{unitName}</strong>
            </div>
            {!mayEditIdentity && (
              <p className="vt-notice">
                Esta pessoa participa de outras equipes. A administração pode
                alterar seu nome e sua foto. Você pode atualizar o contato desta
                unidade.
              </p>
            )}
            <VolunteerPhotoPicker
              value={photo}
              currentUrl={person?.photoUrl}
              onChange={(next) => {
                photoRequestId.current = crypto.randomUUID();
                setPhoto(next);
              }}
              onCroppingChange={setCropping}
              disabled={busy || !mayEditIdentity}
            />
            <div className="space-y-2">
              <Label htmlFor="volunteer-name">
                Nome completo <span aria-hidden="true">*</span>
              </Label>
              <Input
                ref={nameRef}
                id="volunteer-name"
                autoComplete="off"
                value={name}
                maxLength={160}
                disabled={busy || !mayEditIdentity}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Maria Oliveira"
                aria-required="true"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={
                  fieldErrors.name ? "volunteer-name-error" : undefined
                }
              />
              {fieldErrors.name && (
                <p id="volunteer-name-error" className="vt-field-error">
                  {fieldErrors.name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="volunteer-email">
                E-mail <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="volunteer-email"
                type="email"
                autoComplete="off"
                inputMode="email"
                value={email}
                maxLength={254}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@exemplo.com"
                aria-required="true"
                aria-invalid={!!fieldErrors.email}
                aria-describedby="volunteer-email-error volunteer-privacy"
              />
              {fieldErrors.email && (
                <p id="volunteer-email-error" className="vt-field-error">
                  {fieldErrors.email}
                </p>
              )}
              <p id="volunteer-privacy" className="vt-privacy">
                <LockKeyhole aria-hidden="true" />
                {EMAIL_PRIVACY}
              </p>
            </div>
            <label className="vt-invite">
              <input
                type="checkbox"
                checked={invite}
                disabled={busy}
                onChange={(e) => setInvite(e.target.checked)}
              />
              <span>
                Convidar para acessar
                <small>
                  Solicitar à administração a liberação do acesso básico. O
                  cadastro funciona imediatamente.
                </small>
              </span>
            </label>
            {error && (
              <p role="alert" className="vt-error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="vt-success">
                {notice}
              </p>
            )}
          </div>
          <div className="vt-form__footer">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={busy}
            >
              Cancelar
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || cropping}
                onClick={() => void submit(true)}
              >
                Salvar e adicionar outro
              </Button>
              <Button type="submit" disabled={busy || cropping}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
