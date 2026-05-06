import { Card, Collapse, Row, Col, Typography } from 'antd';
import {
  InfoCircleOutlined, BankOutlined, TeamOutlined,
  ArrowRightOutlined, FileTextOutlined,
} from '@ant-design/icons';

/// Educational panel used at the top of the new-Qarzan-Hasana form (both operator and
/// member-portal). Collapsed by default on mobile / for repeat users via the Collapse
/// component; visible-on-load on desktop. Same content + layout in both surfaces so
/// borrowers + cashiers see the same canonical reference.
///
/// RULES.md §15+§57 - one implementation, two consumers.
export function QhProcessDocCard() {
  return (
    <Collapse defaultActiveKey={['about']} ghost
      className="jm-qh-doc-collapse"
      items={[
        {
          key: 'about',
          label: (
            <span className="jm-qh-doc-label">
              <InfoCircleOutlined /> About Qarzan Hasana - read this before submitting
            </span>
          ),
          children: (
            <Card size="small" className="jm-qh-doc-card">
              <Row gutter={[24, 16]}>
                <Col xs={24} md={12}>
                  <Typography.Title level={5} className="jm-qh-doc-section-title">
                    <BankOutlined /> What is Qarzan Hasana?
                  </Typography.Title>
                  <Typography.Paragraph className="jm-qh-doc-paragraph">
                    An interest-free loan from the jamaat's QH fund. The borrower repays the
                    principal in monthly instalments. No interest, no fees - the money you
                    repay goes back into the fund to help the next borrower.
                  </Typography.Paragraph>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Title level={5} className="jm-qh-doc-section-title">
                    <TeamOutlined /> Eligibility
                  </Typography.Title>
                  <ul className="jm-qh-doc-list">
                    <li>Active member in good standing</li>
                    <li>Two guarantors (kafil) - members, not the borrower</li>
                    <li>Neither guarantor in default on another QH loan</li>
                    <li>A clear purpose and a believable repayment plan</li>
                  </ul>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Title level={5} className="jm-qh-doc-section-title">
                    <ArrowRightOutlined /> The process
                  </Typography.Title>
                  <ol className="jm-qh-doc-list">
                    <li><strong>Draft</strong> - this form. Borrower + guarantors at the counter.</li>
                    <li><strong>L1 approval</strong> - first approver reviews the case + reliability profile.</li>
                    <li><strong>L2 approval</strong> - second approver gives final sign-off.</li>
                    <li><strong>Disbursement</strong> - voucher issued; funds go out to the borrower.</li>
                    <li><strong>Repayment</strong> - monthly instalments collected via Receipts.</li>
                  </ol>
                </Col>
                <Col xs={24} md={12}>
                  <Typography.Title level={5} className="jm-qh-doc-section-title">
                    <FileTextOutlined /> Bring with you
                  </Typography.Title>
                  <ul className="jm-qh-doc-list">
                    <li>ITS card / ID for borrower + both guarantors</li>
                    <li>Cashflow document (last 3 months income/expenses) - optional but speeds approval</li>
                    <li>Gold assessor's slip - only if pledging gold</li>
                    <li>Both guarantors physically present to acknowledge their kafalah</li>
                  </ul>
                </Col>
              </Row>
              <div className="jm-qh-doc-foot">
                Typical timeline: same-day submission, 1-3 working days for L1+L2 approval, disbursement same day as L2 approval. Reach out if your need is urgent and we'll prioritise.
              </div>
            </Card>
          ),
        },
      ]}
    />
  );
}
