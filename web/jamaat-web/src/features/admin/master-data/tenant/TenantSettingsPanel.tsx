import { useEffect } from 'react';
import { Card, Form, Input, Button, Space, Tag, App as AntdApp, Alert } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, extractProblem } from '../../../../shared/api/client';

type Tenant = {
  id: string; code: string; name: string; isActive: boolean;
  baseCurrency?: string | null; address?: string | null; phone?: string | null; email?: string | null;
  logoPath?: string | null;
  jamiaatCode?: string | null; jamiaatName?: string | null;
};

type UpdateInput = {
  name: string; address?: string | null; phone?: string | null; email?: string | null;
  jamiaatCode?: string | null; jamiaatName?: string | null;
};

const tenantApi = {
  get: async () => (await api.get('/api/v1/tenant')).data as Tenant,
  update: async (input: UpdateInput) => (await api.put('/api/v1/tenant', input)).data as Tenant,
};

export function TenantSettingsPanel() {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<UpdateInput>();

  const { data, isLoading } = useQuery({ queryKey: ['tenant'], queryFn: tenantApi.get });

  useEffect(() => {
    if (!data) return;
    form.setFieldsValue({
      name: data.name,
      address: data.address ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      jamiaatCode: data.jamiaatCode ?? '',
      jamiaatName: data.jamiaatName ?? '',
    });
  }, [data, form]);

  const mut = useMutation({
    mutationFn: tenantApi.update,
    onSuccess: (t) => {
      message.success('Tenant settings saved.');
      qc.setQueryData(['tenant'], t);
    },
    onError: (e) => message.error(extractProblem(e).detail ?? 'Failed to save'),
  });

  return (
    <Card style={{ border: '1px solid var(--jm-border)' }} loading={isLoading}>
      {data && (
        <Space direction="vertical" size={16} style={{ inlineSize: '100%' }}>
          <Alert type="info" showIcon message={
            <span>
              Tenant code <Tag>{data.code}</Tag> · base currency <Tag>{data.baseCurrency ?? 'AED'}</Tag>
              {data.jamiaatCode && <> · regional group <Tag color="blue">{data.jamiaatCode}</Tag></>}
            </span>
          } />
          <Form layout="vertical" form={form} requiredMark={false}
            onFinish={(values) => mut.mutate({
              name: values.name,
              address: values.address || null,
              phone: values.phone || null,
              email: values.email || null,
              jamiaatCode: values.jamiaatCode || null,
              jamiaatName: values.jamiaatName || null,
            })}>
            <Form.Item label="Jamaat name" name="name" rules={[{ required: true }]}>
              <Input placeholder="e.g., Ajman Jamaat" />
            </Form.Item>
            <Space size="large" wrap style={{ inlineSize: '100%' }}>
              <Form.Item label="Phone" name="phone" style={{ minInlineSize: 220 }}><Input /></Form.Item>
              <Form.Item label="Email" name="email" rules={[{ type: 'email' }]} style={{ minInlineSize: 260 }}><Input /></Form.Item>
            </Space>
            <Form.Item label="Address" name="address"><Input.TextArea rows={2} /></Form.Item>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--jm-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBlock: 8 }}>
              Regional grouping (Jamiaat)
            </div>
            <Alert type="info" showIcon style={{ marginBlockEnd: 12 }}
              message="Jamiaat is the regional group above this Jamaat (e.g., Khaleej). Leave blank if not applicable." />
            <Space size="large" wrap style={{ inlineSize: '100%' }}>
              <Form.Item label="Jamiaat code" name="jamiaatCode" style={{ minInlineSize: 200 }}>
                <Input placeholder="KHALEEJ" />
              </Form.Item>
              <Form.Item label="Jamiaat name" name="jamiaatName" style={{ minInlineSize: 320 }}>
                <Input placeholder="Khaleej" />
              </Form.Item>
            </Space>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBlockStart: 16 }}>
              <Button type="primary" htmlType="submit" loading={mut.isPending}>Save changes</Button>
            </div>
          </Form>
        </Space>
      )}
    </Card>
  );
}
