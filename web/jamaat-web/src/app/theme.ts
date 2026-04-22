import type { ThemeConfig } from 'antd';

/**
 * Jamaat theme — maps our CSS token palette into Ant Design's design tokens.
 * Keep in sync with src/app/tokens.css.
 */
export const jamaatTheme: ThemeConfig = {
  cssVar: { prefix: 'ant' },
  token: {
    colorPrimary: '#0B6E63',
    colorLink: '#0B6E63',
    colorInfo: '#2563EB',
    colorSuccess: '#0A8754',
    colorWarning: '#D97706',
    colorError: '#DC2626',

    borderRadius: 6,
    borderRadiusLG: 10,
    borderRadiusSM: 4,

    colorBgLayout: '#F8FAFC',
    colorBgContainer: '#FFFFFF',
    colorBorder: '#E5E9EF',
    colorBorderSecondary: '#EEF1F5',
    colorText: '#1E293B',
    colorTextSecondary: '#475569',
    colorTextTertiary: '#64748B',

    fontFamily:
      "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontFamilyCode: "'JetBrains Mono', ui-monospace, Menlo, monospace",
    fontSize: 14,
    fontSizeHeading1: 30,
    fontSizeHeading2: 24,
    fontSizeHeading3: 18,
    lineHeight: 1.5,

    boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.03)',
    boxShadowSecondary: '0 8px 16px rgba(15,23,42,0.08), 0 4px 8px rgba(15,23,42,0.04)',

    controlHeight: 36,
    controlHeightLG: 42,
    controlHeightSM: 28,

    wireframe: false,
  },
  components: {
    Layout: {
      headerBg: '#FFFFFF',
      headerHeight: 56,
      headerPadding: '0 24px',
      siderBg: '#0E1B26',
      bodyBg: '#F8FAFC',
    },
    Menu: {
      darkItemBg: '#0E1B26',
      darkItemSelectedBg: 'rgba(11, 110, 99, 0.22)',
      darkItemSelectedColor: '#7DDAC6',
      darkItemHoverBg: 'rgba(255,255,255,0.04)',
      darkItemColor: '#CBD3DD',
      darkSubMenuItemBg: '#0E1B26',
      itemMarginInline: 10,
      itemBorderRadius: 8,
      itemHeight: 40,
    },
    Button: {
      controlHeight: 36,
      paddingInline: 16,
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: 12,
      paddingLG: 20,
      headerHeight: 48,
      headerFontSize: 15,
    },
    Table: {
      headerBg: '#F1F4F7',
      headerColor: '#334155',
      rowHoverBg: '#F8FAFC',
      cellPaddingBlock: 12,
    },
    Input: { controlHeight: 36 },
    Select: { controlHeight: 36 },
    Form: { labelFontSize: 13, labelColor: '#334155' },
    Tag: { borderRadiusSM: 4 },
    Tabs: { horizontalItemPadding: '12px 0', titleFontSize: 14 },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 28,
    },
  },
};
