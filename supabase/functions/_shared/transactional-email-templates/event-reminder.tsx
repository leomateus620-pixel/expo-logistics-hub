/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  eventTitle?: string
  whenRelative?: string
  whenAbsolute?: string
  location?: string | null
  ctaUrl?: string
}

const NAVY = '#0b1f4d'
const GOLD = '#f2c94c'

const EventReminderEmail = ({
  eventTitle = 'Seu próximo evento',
  whenRelative = 'em breve',
  whenAbsolute = '',
  location,
  ctaUrl = 'https://fenasojagestao.com/cronograma-eventos',
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`${eventTitle} — ${whenRelative}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>FENASOJA · Cronograma</Text>
        </Section>

        <Heading style={h1}>Lembrete do seu cronograma</Heading>
        <Text style={lead}>
          Este é um lembrete de que <strong>{eventTitle}</strong> começa {whenRelative}.
        </Text>

        <Section style={card}>
          <Text style={cardLabel}>Quando</Text>
          <Text style={cardValue}>{whenAbsolute || whenRelative}</Text>
          {location ? (
            <>
              <Hr style={hr} />
              <Text style={cardLabel}>Local</Text>
              <Text style={cardValue}>{location}</Text>
            </>
          ) : null}
        </Section>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={ctaUrl} style={button}>
            Abrir cronograma
          </Button>
        </Section>

        <Text style={footer}>
          Você recebeu este e-mail porque faz parte de uma comissão vinculada a este evento.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EventReminderEmail,
  subject: (data: Record<string, unknown>) =>
    `Lembrete: ${data.eventTitle ?? 'seu evento'} ${data.whenRelative ?? ''}`.trim(),
  displayName: 'Lembrete de evento',
  previewData: {
    eventTitle: 'Reunião do Conselho FENASOJA',
    whenRelative: 'amanhã',
    whenAbsolute: 'Quinta-feira, 15/08/2026 às 19:30',
    location: 'Sede FENASOJA — Santa Rosa/RS',
    ctaUrl: 'https://fenasojagestao.com/cronograma-eventos',
  },
} satisfies TemplateEntry

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: '32px 0',
}
const container: React.CSSProperties = {
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px 28px',
  borderRadius: '16px',
  border: `1px solid ${GOLD}55`,
  backgroundColor: '#fbfaf7',
}
const header: React.CSSProperties = { marginBottom: '20px' }
const brand: React.CSSProperties = {
  color: NAVY,
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  margin: 0,
}
const h1: React.CSSProperties = {
  color: NAVY,
  fontSize: '22px',
  lineHeight: 1.25,
  margin: '0 0 12px 0',
  fontWeight: 700,
}
const lead: React.CSSProperties = {
  color: '#3a4560',
  fontSize: '15px',
  lineHeight: 1.55,
  margin: '0 0 20px 0',
}
const card: React.CSSProperties = {
  border: `1px solid ${NAVY}22`,
  borderRadius: '12px',
  padding: '16px 18px',
  backgroundColor: '#ffffff',
}
const cardLabel: React.CSSProperties = {
  color: '#7a8399',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 4px 0',
}
const cardValue: React.CSSProperties = {
  color: NAVY,
  fontSize: '15px',
  fontWeight: 600,
  margin: '0 0 8px 0',
}
const hr: React.CSSProperties = { borderColor: `${NAVY}18`, margin: '10px 0' }
const button: React.CSSProperties = {
  backgroundColor: NAVY,
  color: '#ffffff',
  padding: '12px 26px',
  borderRadius: '10px',
  fontWeight: 700,
  fontSize: '14px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer: React.CSSProperties = {
  color: '#8891a6',
  fontSize: '12px',
  lineHeight: 1.5,
  marginTop: '20px',
  textAlign: 'center' as const,
}
