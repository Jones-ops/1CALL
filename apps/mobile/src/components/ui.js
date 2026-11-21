// UI kit mirroring the 1CALL prototype: .card, .stat, .btn (primary / sec /
// acc / bad), .go, .tag, .steps, .bar, .modal, form fields — plus skeletons,
// tab/chip rows, avatars, action menus and confirm sheets.
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, radius, useTheme } from '../theme';
import { useI18n } from '../i18n';

/**
 * Page shell: safe area + scrollable content with h1/sub.
 *  - `scroll={false}`: render a FlatList yourself (children may be a function receiving the header).
 *  - `footer`: content pinned to the bottom (e.g. Back / Next), always reachable.
 */
export function Screen({
  title,
  sub,
  children,
  onRefresh,
  refreshing = false,
  back = false,
  scroll = true,
  footer = null,
  testID,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const head = <ScreenHeader title={title} sub={sub} back={back} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID={testID}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: footer ? 16 : 32 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {head}
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {typeof children === 'function' ? children(head) : children}
        </View>
      )}
      {footer ? (
        <View
          style={{
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function ScreenHeader({ title, sub, back }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const nav = useNavigation();
  return (
    <View>
      {back && nav.canGoBack() ? (
        <Pressable
          onPress={() => nav.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          hitSlop={8}
          style={{
            minHeight: MIN_TOUCH,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
          }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('common.back')}</Text>
        </Pressable>
      ) : null}
      {title ? <H1>{title}</H1> : null}
      {sub ? <Sub>{sub}</Sub> : <View style={{ height: 14 }} />}
    </View>
  );
}

export function H1({ children }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 }}
    >
      {children}
    </Text>
  );
}
export function H2({ children, style }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 10 }, style]}
    >
      {children}
    </Text>
  );
}
export function Sub({ children, style }) {
  const { colors } = useTheme();
  return (
    <Text style={[{ color: colors.muted, marginBottom: 18, fontSize: 15, lineHeight: 21 }, style]}>
      {children}
    </Text>
  );
}
export function T({ children, style, tone, bold, ...rest }) {
  const { colors } = useTheme();
  const color = tone ? colors[tone] : colors.text;
  return (
    <Text
      style={[{ color, fontSize: 15, lineHeight: 21, fontWeight: bold ? '700' : '400' }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style, testID }) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: 16,
          marginBottom: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  big,
  style,
  icon,
  accessibilityLabel,
  testID,
}) {
  const { colors } = useTheme();
  const v = {
    primary: { bg: colors.primary, fg: '#fff', bd: colors.primary },
    secondary: { bg: 'transparent', fg: colors.primary, bd: colors.primary },
    accent: { bg: colors.accent, fg: colors.accentText, bd: colors.accent },
    danger: { bg: colors.danger, fg: '#fff', bd: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, bd: 'transparent' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        {
          backgroundColor: v.bg,
          borderColor: v.bd,
          borderWidth: 1,
          borderRadius: radius.button,
          minHeight: big ? 56 : MIN_TOUCH,
          paddingHorizontal: big ? 28 : 16,
          paddingVertical: big ? 16 : 10,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: off ? 0.45 : pressed ? 0.85 : 1,
        },
        big && { width: '100%' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={big ? 20 : 16} color={v.fg} />
      ) : null}
      {title ? (
        <Text
          style={{
            color: v.fg,
            fontWeight: big ? '800' : '600',
            fontSize: big ? 18 : 15,
            letterSpacing: big ? 0.5 : 0,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Round icon-only button (e.g. "⋯" menus). */
export function IconButton({ icon, onPress, accessibilityLabel, color, size = 22, testID }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => ({
        width: MIN_TOUCH,
        height: MIN_TOUCH,
        borderRadius: MIN_TOUCH / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.border : 'transparent',
      })}
    >
      <Ionicons name={icon} size={size} color={color || colors.muted} />
    </Pressable>
  );
}

export function Row({ children, style, wrap = true }) {
  return (
    <View
      style={[
        { flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 10, alignItems: 'center' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 13, color: colors.muted, marginTop: 10, marginBottom: 4 }}>
      {children}
    </Text>
  );
}

/** Text input. Password fields (secureTextEntry) get a show/hide eye. */
export function Field({ label, error, style, inputStyle, multiline, secureTextEntry, ...props }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [hidden, setHidden] = useState(true);
  const isPassword = !!secureTextEntry;
  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          multiline={multiline}
          secureTextEntry={isPassword && hidden}
          style={[
            {
              backgroundColor: colors.card,
              borderColor: error ? colors.danger : colors.border,
              borderWidth: 1,
              borderRadius: radius.button,
              paddingHorizontal: 10,
              paddingRight: isPassword ? 48 : 10,
              paddingVertical: 9,
              minHeight: MIN_TOUCH,
              color: colors.text,
              fontSize: 15,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            multiline && { minHeight: 100 },
            inputStyle,
          ]}
          {...props}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('common.showPassword') : t('common.hidePassword')}
            hitSlop={6}
            style={{
              position: 'absolute',
              right: 2,
              width: MIN_TOUCH,
              height: MIN_TOUCH,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <T tone="danger" style={{ fontSize: 13, marginTop: 4 }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

export function Checkbox({ checked, onChange, label, testID }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        minHeight: MIN_TOUCH,
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.muted,
          backgroundColor: checked ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
      </View>
      <Text style={{ flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 }}>{label}</Text>
    </Pressable>
  );
}

/** Dropdown: looks like an input, opens a modal list. options: [{value,label}] */
export function Select({ label, value, options, onChange, placeholder, testID }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const ph = placeholder ?? t('common.select');
  return (
    <View>
      {label ? <Label>{label}</Label> : null}
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label || ph}: ${current?.label || ph}`}
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.button,
          paddingHorizontal: 10,
          minHeight: MIN_TOUCH,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text
          style={{ flex: 1, color: current ? colors.text : colors.muted, fontSize: 15 }}
          numberOfLines={1}
        >
          {current?.label || ph}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <FlatList
          data={options}
          keyExtractor={(o) => String(o.value)}
          style={{ maxHeight: 420 }}
          renderItem={({ item }) => (
            <Pressable
              testID={testID ? `${testID}-option-${item.value}` : undefined}
              onPress={() => {
                onChange(item.value);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: item.value === value }}
              style={{
                minHeight: MIN_TOUCH,
                justifyContent: 'center',
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  color: item.value === value ? colors.primary : colors.text,
                  fontWeight: item.value === value ? '700' : '400',
                  fontSize: 15,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </Sheet>
    </View>
  );
}

/** Centered modal (the prototype's .modal). */
export function Sheet({ visible, onClose, title, children }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 16 }}
        onPress={onClose}
        accessibilityLabel={t('common.close')}
      >
        <Pressable
          style={{
            backgroundColor: colors.card,
            borderRadius: radius.modal,
            padding: 20,
            maxHeight: '90%',
          }}
          onPress={() => {}}
        >
          {title ? <H2>{title}</H2> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "⋯" action menu. actions: [{ label, icon, onPress, tone }] */
export function ActionMenu({ visible, onClose, title, actions }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          testID={a.testID}
          onPress={() => {
            onClose();
            a.onPress();
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: MIN_TOUCH + 4,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {a.icon ? (
            <Ionicons name={a.icon} size={20} color={a.tone ? colors[a.tone] : colors.primary} />
          ) : null}
          <Text
            style={{
              color: a.tone ? colors[a.tone] : colors.text,
              fontSize: 15,
              fontWeight: '600',
            }}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}
      <Button
        title={t('common.cancel')}
        variant="ghost"
        onPress={onClose}
        style={{ marginTop: 8 }}
      />
    </Sheet>
  );
}

/** Confirmation dialog that works on every platform. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onClose,
  busy,
}) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {message ? <T style={{ marginBottom: 14 }}>{message}</T> : null}
      <Row>
        <Button title={t('common.cancel')} variant="secondary" onPress={onClose} />
        <Button
          title={confirmLabel}
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onPress={onConfirm}
          loading={busy}
          style={{ flexGrow: 1 }}
          testID="confirm-sheet-ok"
        />
      </Row>
    </Sheet>
  );
}

/** Horizontally scrolling pill tabs / filter chips. options: [{value,label}] */
export function SegmentedTabs({ options, value, onChange, testID }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      style={{ flexGrow: 0, marginBottom: 14 }}
      testID={testID}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              minHeight: 40,
              paddingHorizontal: 16,
              borderRadius: radius.pill,
              justifyContent: 'center',
              backgroundColor: on ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: on ? colors.primary : colors.border,
            }}
          >
            <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '600', fontSize: 14 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Initials in a coloured circle. */
export function Avatar({ name, size = 40 }) {
  const { colors } = useTheme();
  // Initials from words that start with a letter; phone-only contacts get a person icon.
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const palette = [colors.primary, colors.accent, colors.success, '#7b5cd6', '#0e8fa3'];
  const idx = [...String(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette[idx],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initials ? (
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
      ) : (
        <Ionicons name="person" size={size * 0.5} color="#fff" />
      )}
    </View>
  );
}

/** Pulsing grey block shown while content loads (respects "reduce motion"). */
export function Skeleton({ height = 16, width = '100%', radius: r = 8, style }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
          ]),
        );
        loop.start();
      })
      .catch(() => {});
    return () => loop?.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ height, width, borderRadius: r, backgroundColor: colors.border, opacity }, style]}
    />
  );
}

/** A card-shaped loading placeholder with a few lines. */
export function SkeletonCard({ lines = 3 }) {
  return (
    <Card>
      <Skeleton height={20} width="50%" style={{ marginBottom: 14 }} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={14} width={`${90 - i * 15}%`} style={{ marginBottom: 10 }} />
      ))}
    </Card>
  );
}

export function StatGrid({ children }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      {children}
    </View>
  );
}

export function Stat({ value, label, tone, testID }) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexGrow: 1,
        flexBasis: '45%',
        minWidth: 140,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: tone ? colors[tone] : colors.text }}>
        {value}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

/** Compact stat for 3-per-row grids. */
export function MiniStat({ value, label, tone, testID }) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexGrow: 1,
        flexBasis: '30%',
        minWidth: 92,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.card,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{ fontSize: 20, fontWeight: '700', color: tone ? colors[tone] : colors.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function Tag({ label, tone = 'text' }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: 8,
        paddingVertical: 2,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: colors[tone], fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** Wizard progress: "Step 2 of 4 · Message" with a bar. */
export function Steps({ steps, current }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View
      style={{ marginBottom: 14 }}
      accessibilityRole="progressbar"
      accessibilityLabel={`${t('wizard.step', { n: current, total: steps.length })} · ${steps[current - 1]}`}
    >
      <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 6 }}>
        {t('wizard.step', { n: current, total: steps.length })}
        <Text style={{ color: colors.text, fontWeight: '700' }}>{` · ${steps[current - 1]}`}</Text>
      </Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {steps.map((s, i) => (
          <View
            key={s}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: i < current ? colors.primary : colors.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function ProgressBar({ value, color }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{
        height: 12,
        backgroundColor: colors.border,
        borderRadius: radius.pill,
        overflow: 'hidden',
      }}
    >
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color || colors.accent }} />
    </View>
  );
}

/** Simple table: columns [{key,label,flex,render}] */
export function Table({ columns, rows, keyField = 'id', empty }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const cell = { paddingVertical: 8, paddingRight: 6 };
  return (
    <View>
      <View
        style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        {columns.map((c) => (
          <Text
            key={c.key}
            style={[
              cell,
              { flex: c.flex ?? 1, color: colors.muted, fontWeight: '600', fontSize: 13 },
            ]}
          >
            {c.label}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <T tone="muted" style={{ paddingVertical: 10 }}>
          {empty ?? t('common.nothingYet')}
        </T>
      ) : null}
      {rows.map((r, i) => (
        <View
          key={r[keyField] ?? i}
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            alignItems: 'center',
          }}
        >
          {columns.map((c) => (
            <View key={c.key} style={[cell, { flex: c.flex ?? 1 }]}>
              {c.render ? (
                c.render(r)
              ) : (
                <Text style={{ color: colors.text, fontSize: 14 }}>{String(r[c.key] ?? '')}</Text>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Two-column key/value table (campaign review). */
export function KV({ rows }) {
  const { colors } = useTheme();
  return (
    <View>
      {rows.map(([k, v, tone]) => (
        <View
          key={k}
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          <Text style={{ flex: 1, color: colors.muted, fontWeight: '600', fontSize: 14 }}>{k}</Text>
          <Text
            style={{
              flex: 1.3,
              color: tone ? colors[tone] : colors.text,
              fontSize: 14,
              fontWeight: tone ? '700' : '400',
            }}
          >
            {v}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <T tone="danger" style={{ marginVertical: 8 }} accessibilityRole="alert">
      {children}
    </T>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return <ActivityIndicator style={{ marginVertical: 24 }} color={colors.primary} />;
}

/** A friendly empty state with an icon and an optional action. */
export function EmptyState({ icon = 'sparkles-outline', title, message, action }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      {title ? (
        <T bold style={{ textAlign: 'center' }}>
          {title}
        </T>
      ) : null}
      {message ? (
        <T tone="muted" style={{ textAlign: 'center', fontSize: 14 }}>
          {message}
        </T>
      ) : null}
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}

export const statusTone = (s) =>
  ({
    succeeded: 'success',
    failed: 'danger',
    pending: 'warning',
    completed: 'success',
    running: 'primary',
    cancelled: 'danger',
    rejected: 'danger',
    paused: 'warning',
    pending_approval: 'warning',
    scheduled: 'primary',
    active: 'success',
    suspended: 'danger',
  })[s] || 'text';
