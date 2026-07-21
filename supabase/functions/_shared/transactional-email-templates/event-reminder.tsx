import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import {
  normalizeEventReminderTemplateData,
  type EventReminderTemplateData,
  type EventReminderViewModel,
} from '../eventReminderModel.ts'

const NAVY = '#0b1f4d'
const DEEP_NAVY = '#07162f'
const GOLD = '#f2c94c'
const TEXT = '#12213f'
const MUTED = '#506078'

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <tr>
      <td style={{ ...detailCell, ...(last ? {} : detailDivider) }} className="email-card-cell">
        <Text style={detailLabel} className="email-muted">{label}</Text>
        <Text style={detailValue} className="email-text">{value}</Text>
      </td>
    </tr>
  )
}

function RelatedList({
  title,
  items,
}: {
  title: string
  items: Array<{ title: string; detail?: string | null }>
}) {
  if (!items.length) return null
  return (
    <Section style={relatedSection} className="email-related">
      <Text style={relatedTitle} className="email-text">{title}</Text>
      {items.map((item, index) => (
        <table key={`${item.title}-${index}`} role="presentation" width="100%" cellPadding="0" cellSpacing="0">
          <tbody>
            <tr>
              <td style={bulletCell} valign="top"><span style={bullet}>&bull;</span></td>
              <td style={relatedItemCell}>
                <Text style={relatedItem} className="email-text">{item.title}</Text>
                {item.detail ? <Text style={relatedDetail} className="email-muted">{item.detail}</Text> : null}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </Section>
  )
}

export function EventReminderEmail(raw: EventReminderTemplateData) {
  const data: EventReminderViewModel = normalizeEventReminderTemplateData(raw)
  const detailRows = [
    { label: 'Data', value: data.dateLabel },
    { label: 'Horário', value: data.timeLabel },
    ...(data.location ? [{ label: 'Local', value: data.location }] : []),
    ...(data.commissionLabel ? [{ label: 'Comissão', value: data.commissionLabel }] : []),
    ...(data.mainEventTitle ? [{ label: 'Evento principal', value: data.mainEventTitle }] : []),
  ]

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{emailCss}</style>
      </Head>
      <Preview>{`${data.heading}: ${data.eventTitle}`}</Preview>
      <Body style={main} className="email-body">
        <Container style={container} className="email-container">
          <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={shell} className="email-shell">
            <tbody>
              <tr>
                <td style={header} className="email-header">
                  <table role="presentation" width="100%" cellPadding="0" cellSpacing="0">
                    <tbody>
                      <tr>
                        <td>
                          <Text style={brand}>FENASOJA <span style={brandEdition}>2028</span></Text>
                          <Text style={context}>Cronograma e Eventos</Text>
                        </td>
                        <td align="right" valign="middle">
                          <span style={headerMark} aria-hidden="true">F</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>

              <tr>
                <td style={content} className="email-content">
                  <Text style={reminderKicker} className="email-accent">Lembrete de evento</Text>
                  <Heading as="h1" style={h1} className="email-heading">{data.heading}</Heading>
                  <Text style={intro} className="email-muted">{data.intro}</Text>

                  <Heading as="h2" style={eventTitleStyle} className="email-title">{data.eventTitle}</Heading>
                  {data.commissionLabel ? (
                    <Text style={commissionBadge} className="email-commission">{data.commissionLabel}</Text>
                  ) : null}

                  <table
                    role="presentation"
                    width="100%"
                    cellPadding="0"
                    cellSpacing="0"
                    style={detailsCard}
                    className="email-card"
                  >
                    <tbody>
                      {detailRows.map((row, index) => (
                        <DetailRow key={row.label} label={row.label} value={row.value} last={index === detailRows.length - 1} />
                      ))}
                    </tbody>
                  </table>

                  <RelatedList title="Subeventos relacionados" items={data.subevents} />
                  <RelatedList
                    title="Demandas para revisar"
                    items={data.pendingItems.map((title) => ({ title }))}
                  />

                  <Section style={ctaSection}>
                    <Button href={data.ctaUrl} style={button} className="email-button">
                      Abrir evento no cronograma
                    </Button>
                    {data.googleCalendarUrl ? (
                      <Text style={secondaryCtaText}>
                        <a href={data.googleCalendarUrl} style={secondaryLink} className="email-secondary-link">
                          Ver também no Google Agenda
                        </a>
                      </Text>
                    ) : null}
                  </Section>

                  <Section style={recipientBox} className="email-recipient-box">
                    <Text style={recipientText} className="email-muted">{data.recipientContext}</Text>
                  </Section>
                </td>
              </tr>

              <tr>
                <td style={footer} className="email-footer">
                  <Text style={footerBrand}>FENASOJA 2028 · Cronograma e Eventos</Text>
                  <Text style={footerText}>
                    Mensagem automática e segura. Para atualizar o evento, acesse o sistema FENASOJA.
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Container>
      </Body>
    </Html>
  )
}

const main: React.CSSProperties = {
  width: '100%',
  margin: 0,
  padding: '24px 12px',
  backgroundColor: '#e9eef6',
  color: TEXT,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  WebkitTextSizeAdjust: '100%',
}
const container: React.CSSProperties = { width: '100%', maxWidth: '600px', margin: '0 auto' }
const shell: React.CSSProperties = {
  width: '100%',
  border: '1px solid #cbd5e4',
  borderRadius: '18px',
  backgroundColor: '#f7f9fc',
  borderCollapse: 'separate',
  borderSpacing: 0,
  overflow: 'hidden',
  boxShadow: '0 18px 46px rgba(7, 22, 47, 0.12)',
}
const header: React.CSSProperties = { padding: '24px 28px', backgroundColor: NAVY }
const brand: React.CSSProperties = { margin: 0, color: '#fff', fontSize: '18px', fontWeight: 800, lineHeight: '24px' }
const brandEdition: React.CSSProperties = { color: GOLD }
const context: React.CSSProperties = { margin: '3px 0 0', color: '#dbe6f8', fontSize: '12px', fontWeight: 650, letterSpacing: '0.06em' }
const headerMark: React.CSSProperties = {
  display: 'inline-block', width: '38px', height: '38px', border: '1px solid #6f82a5',
  borderRadius: '12px', backgroundColor: '#132d5d', color: GOLD, fontSize: '20px', fontWeight: 800,
  lineHeight: '38px', textAlign: 'center',
}
const content: React.CSSProperties = { padding: '34px 32px 30px', backgroundColor: '#f7f9fc' }
const reminderKicker: React.CSSProperties = { margin: 0, color: '#8a6308', fontSize: '12px', fontWeight: 750, letterSpacing: '0.06em', textTransform: 'uppercase' }
const h1: React.CSSProperties = { margin: '7px 0 10px', color: NAVY, fontSize: '25px', fontWeight: 780, lineHeight: '31px', letterSpacing: '-0.02em' }
const intro: React.CSSProperties = { margin: '0 0 24px', color: MUTED, fontSize: '15px', lineHeight: '23px' }
const eventTitleStyle: React.CSSProperties = { margin: '0 0 11px', color: TEXT, fontSize: '23px', fontWeight: 760, lineHeight: '30px', letterSpacing: '-0.015em' }
const commissionBadge: React.CSSProperties = {
  display: 'inline-block', margin: '0 0 20px', padding: '6px 10px', border: '1px solid #c99d32',
  borderRadius: '999px', backgroundColor: '#fff7dc', color: '#6d4d04', fontSize: '12px', fontWeight: 700,
  lineHeight: '16px',
}
const detailsCard: React.CSSProperties = {
  width: '100%', border: '1px solid #cbd5e4', borderRadius: '13px', borderCollapse: 'separate',
  borderSpacing: 0, backgroundColor: '#fff', overflow: 'hidden',
}
const detailCell: React.CSSProperties = { padding: '14px 17px', backgroundColor: '#fff' }
const detailDivider: React.CSSProperties = { borderBottom: '1px solid #e1e7f0' }
const detailLabel: React.CSSProperties = { margin: 0, color: '#607089', fontSize: '12px', fontWeight: 750, letterSpacing: '0.035em', lineHeight: '17px', textTransform: 'uppercase' }
const detailValue: React.CSSProperties = { margin: '3px 0 0', color: TEXT, fontSize: '15px', fontWeight: 650, lineHeight: '21px' }
const relatedSection: React.CSSProperties = { marginTop: '18px', padding: '16px 17px', border: '1px solid #d5deeb', borderRadius: '12px', backgroundColor: '#eef3fa' }
const relatedTitle: React.CSSProperties = { margin: '0 0 9px', color: NAVY, fontSize: '14px', fontWeight: 750, lineHeight: '20px' }
const bulletCell: React.CSSProperties = { width: '18px', padding: '2px 0 4px', color: '#98700f' }
const bullet: React.CSSProperties = { color: '#98700f', fontSize: '18px', lineHeight: '18px' }
const relatedItemCell: React.CSSProperties = { padding: '0 0 7px' }
const relatedItem: React.CSSProperties = { margin: 0, color: TEXT, fontSize: '14px', fontWeight: 650, lineHeight: '20px' }
const relatedDetail: React.CSSProperties = { margin: '2px 0 0', color: MUTED, fontSize: '13px', lineHeight: '19px' }
const ctaSection: React.CSSProperties = { margin: '26px 0 22px', textAlign: 'center' }
const button: React.CSSProperties = {
  display: 'inline-block', minWidth: '230px', padding: '14px 22px', border: `1px solid ${GOLD}`,
  borderRadius: '10px', backgroundColor: GOLD, backgroundImage: `linear-gradient(${GOLD}, ${GOLD})`,
  color: DEEP_NAVY, fontSize: '15px', fontWeight: 760, lineHeight: '20px', textAlign: 'center', textDecoration: 'none',
}
const secondaryCtaText: React.CSSProperties = { margin: '14px 0 0', fontSize: '13px', lineHeight: '19px' }
const secondaryLink: React.CSSProperties = { color: '#185abc', fontWeight: 700, textDecoration: 'underline' }
const recipientBox: React.CSSProperties = { padding: '14px 16px', borderLeft: `3px solid ${GOLD}`, backgroundColor: '#edf2f8' }
const recipientText: React.CSSProperties = { margin: 0, color: MUTED, fontSize: '13px', lineHeight: '20px' }
const footer: React.CSSProperties = { padding: '22px 28px', backgroundColor: DEEP_NAVY, textAlign: 'center' }
const footerBrand: React.CSSProperties = { margin: 0, color: '#f7f9fd', fontSize: '13px', fontWeight: 700, lineHeight: '19px' }
const footerText: React.CSSProperties = { margin: '5px 0 0', color: '#c7d2e6', fontSize: '12px', lineHeight: '18px' }

const emailCss = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  a { color: inherit; }
  @media only screen and (max-width: 620px) {
    .email-body { padding: 0 !important; }
    .email-container, .email-shell { width: 100% !important; max-width: 100% !important; }
    .email-shell { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
    .email-header { padding: 21px 18px !important; }
    .email-content { padding: 26px 18px 24px !important; }
    .email-heading { font-size: 23px !important; line-height: 29px !important; }
    .email-title { font-size: 21px !important; line-height: 28px !important; }
    .email-button { display: block !important; box-sizing: border-box !important; width: 100% !important; min-width: 0 !important; }
    .email-footer { padding: 20px 18px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .email-body { background: #061229 !important; color: #f7f9fd !important; }
    .email-shell, .email-content { background: #0b1b38 !important; border-color: #3f5275 !important; }
    .email-heading, .email-title, .email-text { color: #f7f9fd !important; }
    .email-muted { color: #d2dbea !important; }
    .email-accent { color: #f5cf66 !important; }
    .email-card, .email-card-cell { background: #102443 !important; border-color: #405578 !important; }
    .email-related, .email-recipient-box { background: #102443 !important; border-color: #4b5f80 !important; }
    .email-commission { background: #3a2d0c !important; color: #fff0bc !important; border-color: #b68c2e !important; }
    .email-secondary-link { color: #9fc4ff !important; }
  }
  [data-ogsc] .email-body { background: #061229 !important; }
  [data-ogsc] .email-shell, [data-ogsc] .email-content { background: #0b1b38 !important; }
  [data-ogsc] .email-heading, [data-ogsc] .email-title, [data-ogsc] .email-text { color: #f7f9fd !important; }
  [data-ogsc] .email-muted { color: #d2dbea !important; }
  [data-ogsc] .email-card, [data-ogsc] .email-card-cell, [data-ogsc] .email-related, [data-ogsc] .email-recipient-box { background: #102443 !important; }
`
