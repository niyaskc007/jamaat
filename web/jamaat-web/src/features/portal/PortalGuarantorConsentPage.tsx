import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Result, Tag, Space, Descriptions, App as AntdApp, Spin, Alert } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PortalLayout } from './PortalLayout';
import { guarantorConsentPortalApi } from '../qarzan-hasana/qarzanHasanaApi';
import { extractProblem } from '../../shared/api/client';
import { money } from '../../shared/format/format';

/// Public-facing page where a guarantor accepts or declines kafalah for a QH loan.
/// The token in the URL is the credential - no login required. Once a response is
/// recorded, the page locks into a confirmation state.
export function PortalGuarantorConsentPage() {
  const { token = '' } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();

  const q = useQuery({
    queryKey: ['qh-consent-portal', token],
    queryFn: () => guarantorConsentPortalApi.get(token),
    enabled: !!token,
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => guarantorConsentPortalApi.accept(token),
    onSuccess: (data) => { qc.setQueryData(['qh-consent-portal', token], data); message.success('Consent recorded.'); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Could not record consent'),
  });
  const declineMut = useMutation({
    mutationFn: () => guarantorConsentPortalApi.decline(token),
    onSuccess: (data) => { qc.setQueryData(['qh-consent-portal', token], data); message.info('Decline recorded.'); },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Could not record decline'),
  });

  if (q.isLoading) {
    return <PortalLayout><div style={{ textAlign: 'center', padding: 60 }}><Spin /></div></PortalLayout>;
  }
  if (q.isError || !q.data) {
    return (
      <PortalLayout>
        <Result status="404" title="Consent link not valid"
          subTitle="This link may have expired, been revoked, or never existed. Please ask the borrower to share a fresh link." />
      </PortalLayout>
    );
  }

  const d = q.data;
  const responded = d.status !== 1;

  return (
    <PortalLayout>
      <div style={{ maxInlineSize: 720, marginInline: 'auto' }}>
        <Card style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBlockEnd: 16 }}>
            <SafetyCertificateOutlined style={{ fontSize: 32, color: 'var(--portal-primary)' }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--portal-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Qarzan Hasana - Guarantor consent
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {d.guarantorName}, you are invited to act as kafil for this loan.
              </div>
            </div>
          </div>

          {responded && (
            <Alert
              type={d.status === 2 ? 'success' : 'warning'}
              icon={d.status === 2 ? <CheckCircleFilled /> : <CloseCircleFilled />}
              showIcon
              style={{ marginBlockEnd: 16 }}
              message={d.status === 2 ? 'You have accepted this kafalah.' : 'You have declined this kafalah.'}
              description={d.respondedAtUtc ? `Recorded on ${dayjs(d.respondedAtUtc).format('DD MMM YYYY, HH:mm')}.` : ''}
            />
          )}

          <Descriptions column={1} size="small" bordered
            labelStyle={{ width: 180, color: 'var(--portal-muted)' }}>
            <Descriptions.Item label="Loan code"><strong>{d.loanCode}</strong></Descriptions.Item>
            <Descriptions.Item label="Borrower">
              {d.borrowerName} <span style={{ color: 'var(--portal-muted)', fontSize: 12, marginInlineStart: 8 }}>ITS {d.borrowerItsNumber}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Amount requested">
              <strong>{money(d.amountRequested, d.currency)}</strong> over {d.instalmentsRequested} monthly instalment{d.instalmentsRequested === 1 ? '' : 's'}
            </Descriptions.Item>
            {d.purpose && <Descriptions.Item label="Purpose">{d.purpose}</Descriptions.Item>}
          </Descriptions>

          <div style={{ marginBlockStart: 20, padding: 16, background: '#F1F5F9', borderRadius: 8, fontSize: 13, color: '#334155' }}>
            <strong>What does it mean to be a kafil?</strong>
            <ul style={{ marginBlock: 8, paddingInlineStart: 18 }}>
              <li>If the borrower defaults on this loan, you may be asked to step in.</li>
              <li>You can be one of at most two simultaneous active guarantees in this jamaat.</li>
              <li>You are not legally bound until you record your acceptance below.</li>
              <li>Decline freely if you have any doubts - it is your right.</li>
            </ul>
          </div>

          {!responded && (
            <Space style={{ marginBlockStart: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <Button danger icon={<CloseCircleFilled />} loading={declineMut.isPending}
                disabled={acceptMut.isPending} onClick={() => declineMut.mutate()}>
                Decline
              </Button>
              <Button type="primary" icon={<CheckCircleFilled />} loading={acceptMut.isPending}
                disabled={declineMut.isPending} onClick={() => acceptMut.mutate()}
                style={{ background: 'var(--portal-primary)', borderColor: 'var(--portal-primary)' }}>
                I accept this kafalah
              </Button>
            </Space>
          )}

          {responded && (
            <div style={{ marginBlockStart: 16, fontSize: 12, color: 'var(--portal-muted)' }}>
              Status: <Tag color={d.status === 2 ? 'green' : 'red'} style={{ marginInlineStart: 4 }}>
                {d.status === 2 ? 'Accepted' : 'Declined'}
              </Tag>
            </div>
          )}
        </Card>

        <div style={{ marginBlockStart: 16, fontSize: 12, color: 'var(--portal-muted)', textAlign: 'center' }}>
          Your IP and browser are recorded with this response for audit purposes.
        </div>
      </div>
    </PortalLayout>
  );
}
