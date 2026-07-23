import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Check,
  Eye,
  EyeOff,
  FileCheck2,
  KeyRound,
  Landmark,
  Layers3,
  Loader2,
  LockKeyhole,
  Mail,
  Map,
  Route,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { CronogramaLoginHero } from '@/components/auth/CronogramaLoginHero';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import {
  SELECTED_COMMISSION_STORAGE_KEY,
  getCommissionModule,
  getModuleRoute,
} from '@/modules/commissions/commissionRegistry';
import '@/styles/login-experience.css';

interface LoginPageProps {
  returnTo?: string;
}

interface CapabilityItem {
  description: string;
  icon: LucideIcon;
  label: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

type FormPhase = 'idle' | 'submitting' | 'success';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUCCESS_REDIRECT_DELAY_MS = 800;

const commercialMapCapabilities: CapabilityItem[] = [
  {
    icon: Map,
    label: 'Parque mapeado',
    description: 'Estruturas oficiais',
  },
  {
    icon: Landmark,
    label: 'Disponibilidade',
    description: 'Situação comercial',
  },
  {
    icon: FileCheck2,
    label: 'Contratos',
    description: 'Histórico conectado',
  },
  {
    icon: ShieldCheck,
    label: 'Acesso controlado',
    description: 'Perfis e permissões',
  },
];

const adminCapabilities: CapabilityItem[] = [
  {
    icon: Landmark,
    label: 'Governança central',
    description: 'Visão institucional',
  },
  {
    icon: UsersRound,
    label: 'Perfis e acessos',
    description: 'Controle por função',
  },
  {
    icon: Layers3,
    label: 'Comissões',
    description: 'Gestão integrada',
  },
  {
    icon: FileCheck2,
    label: 'Decisões auditáveis',
    description: 'Registro conectado',
  },
];

function getStoredModuleSlug() {
  try {
    return localStorage.getItem(SELECTED_COMMISSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getModuleSlugFromPath(path?: string) {
  return path?.match(/^\/comissoes\/([^/?#]+)/)?.[1] ?? null;
}

function validateEmail(value: string) {
  const normalized = value.trim();
  if (!normalized) return 'Informe seu e-mail.';
  if (!EMAIL_PATTERN.test(normalized)) return 'Digite um e-mail válido.';
  return undefined;
}

function validatePassword(value: string) {
  if (!value) return 'Informe sua senha.';
  return undefined;
}

export default function LoginPage({ returnTo }: LoginPageProps) {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { moduleSlug } = useParams();
  const redirectTimerRef = useRef<number | null>(null);
  const submissionRedirectRef = useRef(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [authError, setAuthError] = useState('');
  const [phase, setPhase] = useState<FormPhase>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  const isAdminLogin = location.pathname === '/login/admin' || moduleSlug === 'admin' || returnTo?.startsWith('/admin');
  const selectedSlug = isAdminLogin
    ? 'admin'
    : moduleSlug || getModuleSlugFromPath(returnTo) || getStoredModuleSlug() || 'logistica';
  const isCronogramaLogin = selectedSlug === 'cronograma-eventos' || returnTo?.startsWith('/cronograma-eventos');
  const isCommercialMapLogin = selectedSlug === 'mapa-comercial' || returnTo?.startsWith('/mapa-comercial');
  const selectedModule = getCommissionModule(selectedSlug);
  const contextName = isAdminLogin
    ? 'Administrador'
    : isCronogramaLogin
      ? 'Cronograma e Eventos'
      : isCommercialMapLogin
        ? 'Mapa Comercial'
        : selectedModule
          ? `Comissão de ${selectedModule.name}`
          : 'Comissão de Logística';
  const heroTitleLead = isAdminLogin
    ? 'Governança institucional'
    : isCommercialMapLogin
      ? 'Gestão territorial'
      : 'Ambiente seguro';
  const heroTitleAccent = isAdminLogin
    ? 'Fenasoja 2028'
    : isCommercialMapLogin
      ? 'e comercial do parque'
      : 'das comissões';
  const capabilities = isCommercialMapLogin
    ? commercialMapCapabilities
    : isAdminLogin
      ? adminCapabilities
      : [
          {
            icon: Layers3,
            label: 'Módulo selecionado',
            description: selectedModule?.name ?? 'Logística',
          },
          {
            icon: CalendarDays,
            label: 'Agenda operacional',
            description: 'Prioridades do ciclo',
          },
          {
            icon: UsersRound,
            label: 'Equipe conectada',
            description: 'Papéis definidos',
          },
          {
            icon: ShieldCheck,
            label: 'Dados do módulo',
            description: 'Acesso controlado',
          },
        ];
  const ContextIcon = isAdminLogin
    ? LockKeyhole
    : isCronogramaLogin
      ? CalendarRange
      : isCommercialMapLogin
        ? Map
        : Layers3;
  const isBusy = phase !== 'idle';
  const emailInvalid = Boolean(fieldErrors.email || authError);
  const passwordInvalid = Boolean(fieldErrors.password || authError);
  const emailDescribedBy = [
    fieldErrors.email ? 'login-email-error' : null,
    authError ? 'login-auth-error' : null,
  ].filter(Boolean).join(' ') || undefined;
  const passwordDescribedBy = [
    fieldErrors.password ? 'login-password-error' : null,
    authError ? 'login-auth-error' : null,
  ].filter(Boolean).join(' ') || undefined;

  const resolveTarget = () => {
    if (returnTo && returnTo !== '/' && !returnTo.startsWith('/login')) return returnTo;
    if (isAdminLogin) return '/admin';
    if (isCronogramaLogin) return '/cronograma-eventos';
    if (isCommercialMapLogin) return '/mapa-comercial';
    if (selectedModule) return getModuleRoute(selectedModule);
    return '/comissoes/logistica/dashboard';
  };

  useEffect(() => {
    if (
      !authLoading
      && user
      && location.pathname.startsWith('/login')
      && !submissionRedirectRef.current
    ) {
      navigate(resolveTarget(), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, location.pathname]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
      submissionRedirectRef.current = false;
    };
  }, []);

  const updateEmail = (value: string) => {
    setEmail(value);
    setAuthError('');
    if (touched.email) {
      setFieldErrors((current) => ({ ...current, email: validateEmail(value) }));
    }
  };

  const updatePassword = (value: string) => {
    setPassword(value);
    setAuthError('');
    if (touched.password) {
      setFieldErrors((current) => ({ ...current, password: validatePassword(value) }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isBusy) return;

    const nextErrors: FieldErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };

    setTouched({ email: true, password: true });
    setFieldErrors(nextErrors);
    setAuthError('');

    if (nextErrors.email || nextErrors.password) {
      const firstInvalidField = nextErrors.email
        ? emailInputRef.current
        : passwordInputRef.current;
      firstInvalidField?.focus();
      return;
    }

    submissionRedirectRef.current = true;
    setPhase('submitting');

    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        submissionRedirectRef.current = false;
        setAuthError('E-mail ou senha incorretos. Confira suas credenciais e tente novamente.');
        setPhase('idle');
        return;
      }

      setPhase('success');
      redirectTimerRef.current = window.setTimeout(
        () => {
          submissionRedirectRef.current = false;
          navigate(resolveTarget(), { replace: true });
        },
        SUCCESS_REDIRECT_DELAY_MS,
      );
    } catch {
      submissionRedirectRef.current = false;
      setAuthError('Não foi possível acessar o sistema agora. Verifique sua conexão e tente novamente.');
      setPhase('idle');
    }
  };

  return (
    <main
      className="auth-screen"
      data-auth-phase={phase}
      data-module={selectedSlug}
    >
      {!isCronogramaLogin && (
        <div className="auth-screen__cycle" aria-hidden="true">
          <span>2026</span>
          <i />
          <span>2027</span>
          <i />
          <span data-current="true">2028</span>
        </div>
      )}

      <div className="auth-layout">
        {isCronogramaLogin ? (
          <CronogramaLoginHero />
        ) : (
          <section className="auth-hero" aria-labelledby="login-hero-title">
            <FenasojaBrand
              className="auth-hero__brand"
              scale="display"
              subtitle="Planejamento institucional"
              tone="dark"
            />

            <div className="auth-hero__context">
              <span className="auth-hero__context-icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <span className="auth-hero__context-label">Acesso protegido</span>
              <span className="auth-hero__context-divider" aria-hidden="true" />
              <span className="auth-hero__context-name">{contextName}</span>
            </div>

            <h1 id="login-hero-title" className="auth-hero__title">
              {heroTitleLead}
              <span>{heroTitleAccent}</span>
            </h1>

            <p className="auth-hero__capability-label">Capacidades do ambiente</p>
            <ul className="auth-capabilities" aria-label="Capacidades do ambiente selecionado">
              {capabilities.map(({ description, icon: Icon, label }, index) => (
                <li
                  key={label}
                  className="auth-capability"
                  style={{ '--capability-index': index } as CSSProperties}
                >
                  <span className="auth-capability__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="auth-capability__copy">
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          className="auth-panel"
          aria-labelledby="login-title"
          aria-busy={phase === 'submitting'}
        >
          <div className="auth-panel__brand-row">
            <FenasojaBrand
              compact
              showEdition={!isCronogramaLogin}
              subtitle="Acesso ao sistema"
              tone="light"
            />
            <div className="auth-module-badge">
              <span className="auth-module-badge__icon" aria-hidden="true">
                <ContextIcon />
              </span>
              <span className="auth-module-badge__copy">
                <span>Módulo selecionado</span>
                <strong>{contextName}</strong>
              </span>
            </div>
          </div>

          <div className="auth-panel__heading">
            <p className="auth-panel__eyebrow">
              <ShieldCheck aria-hidden="true" />
              Identificação segura
            </p>
            <h2 id="login-title">Entrar</h2>
            <p>
              Use suas credenciais institucionais para continuar em <strong>{contextName}</strong>.
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="login-email">
                E-mail
              </label>
              <div
                className="auth-input-frame"
                data-field="email"
                data-filled={email.trim().length > 0}
                data-invalid={emailInvalid}
                data-disabled={isBusy}
              >
                <span className="auth-input-frame__icon" aria-hidden="true">
                  <Mail />
                </span>
                <Input
                  ref={emailInputRef}
                  id="login-email"
                  className="auth-input-control"
                  type="email"
                  placeholder="SEU.EMAIL@FENASOJA.COM.BR"
                  value={email}
                  onChange={(event) => updateEmail(event.target.value)}
                  onBlur={() => {
                    setTouched((current) => ({ ...current, email: true }));
                    setFieldErrors((current) => ({ ...current, email: validateEmail(email) }));
                  }}
                  required
                  disabled={isBusy}
                  autoComplete="email"
                  autoCapitalize="none"
                  enterKeyHint="next"
                  inputMode="email"
                  spellCheck={false}
                  aria-invalid={emailInvalid}
                  aria-describedby={emailDescribedBy}
                />
              </div>
              {fieldErrors.email && (
                <p
                  className="auth-field__error"
                  id="login-email-error"
                  role="alert"
                  aria-live="assertive"
                >
                  <AlertCircle aria-hidden="true" />
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-field__label" htmlFor="login-password">
                Senha
              </label>
              <div
                className="auth-input-frame"
                data-field="password"
                data-filled={password.length > 0}
                data-invalid={passwordInvalid}
                data-disabled={isBusy}
                data-has-action="true"
              >
                <span className="auth-input-frame__icon" aria-hidden="true">
                  <KeyRound />
                </span>
                <Input
                  ref={passwordInputRef}
                  id="login-password"
                  className="auth-input-control"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(event) => updatePassword(event.target.value)}
                  onBlur={() => {
                    setTouched((current) => ({ ...current, password: true }));
                    setFieldErrors((current) => ({ ...current, password: validatePassword(password) }));
                  }}
                  required
                  disabled={isBusy}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  aria-invalid={passwordInvalid}
                  aria-describedby={passwordDescribedBy}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={isBusy}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                >
                  {showPassword
                    ? <EyeOff aria-hidden="true" />
                    : <Eye aria-hidden="true" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p
                  className="auth-field__error"
                  id="login-password-error"
                  role="alert"
                  aria-live="assertive"
                >
                  <AlertCircle aria-hidden="true" />
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {authError && (
              <div
                className="auth-form__alert"
                id="login-auth-error"
                role="alert"
                aria-live="assertive"
              >
                <span className="auth-form__alert-icon" aria-hidden="true">
                  <AlertCircle />
                </span>
                <span>{authError}</span>
              </div>
            )}

            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {phase === 'submitting' && 'Validando suas credenciais.'}
              {phase === 'success' && 'Acesso confirmado. Redirecionando para o ambiente selecionado.'}
            </p>

            <Button
              type="submit"
              className="auth-submit w-full"
              disabled={isBusy}
              data-phase={phase}
            >
              <span className="auth-submit__leading" aria-hidden="true">
                {phase === 'submitting'
                  ? <Loader2 className="animate-spin" />
                  : phase === 'success'
                    ? <Check />
                    : <LockKeyhole />}
              </span>
              <span>
                {phase === 'submitting'
                  ? 'Validando acesso…'
                  : phase === 'success'
                    ? 'Acesso confirmado'
                    : 'Entrar no sistema'}
              </span>
              {phase === 'idle' && <ArrowRight className="auth-submit__arrow" aria-hidden="true" />}
            </Button>
          </form>

          <div className="auth-panel__footer">
            <div className="auth-restricted-note">
              <span className="auth-restricted-note__icon" aria-hidden="true">
                <ShieldCheck />
              </span>
              <span>
                <strong>Acesso restrito</strong>
                Solicite suas credenciais ao administrador.
              </span>
            </div>
            <Link to="/portal" className="auth-back-link">
              <ArrowLeft aria-hidden="true" />
              Voltar ao portal
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
