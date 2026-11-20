// UI kit mirroring the 1CALL prototype: .card, .stat, .btn (primary / sec /
// acc / bad), .go, .tag, .steps, .bar, .modal, form fields.
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { MIN_TOUCH, radius, useTheme } from '../theme';
/**
 * Page shell: safe area + scrollable content with h1/sub.
 * Pass `scroll={false}` to render a FlatList yourself (use ScreenHeader inside it).
 */
export function Screen({
  title,
  sub,
  children,
  onRefresh,
  refreshing = false,
  back = false,
  scroll = true,
  testID,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const head = <ScreenHeader title={title} sub={sub} back={back} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID={testID}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
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
    </View>
  );
}

export function ScreenHeader({ title, sub, back }) {
  const { colors } = useTheme();
  const nav = useNavigation();
  return (
    <View>
      {back && nav.canGoBack() ? (
        <Pressable
          onPress={() => nav.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={{
            minHeight: MIN_TOUCH,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
          }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Back</Text>
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

export function Field({ label, error, style, inputStyle, multiline, ...props }) {
  const { colors } = useTheme();
  return (
    <View style={style}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.danger : colors.border,
            borderWidth: 1,
            borderRadius: radius.button,
            paddingHorizontal: 10,
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
export function Select({ label, value, options, onChange, placeholder = 'Select…', testID }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View>
      {label ? <Label>{label}</Label> : null}
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label || 'Select'}: ${current?.label || placeholder}`}
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
          {current?.label || placeholder}
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 16 }}
        onPress={onClose}
        accessibilityLabel="Close"
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

export function Steps({ steps, current }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current} of ${steps.length}: ${steps[current - 1]}`}
    >
      {steps.map((s, i) => {
        const on = i + 1 === current;
        return (
          <View
            key={s}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: radius.pill,
              backgroundColor: on ? colors.primary : colors.border,
            }}
          >
            <Text
              style={{ fontSize: 13, color: on ? '#fff' : colors.text }}
            >{`${i + 1}. ${s}`}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value }) {
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
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.accent }} />
    </View>
  );
}

/** Simple table: columns [{key,label,flex,render}] */
export function Table({ columns, rows, keyField = 'id', empty = 'Nothing here yet.' }) {
  const { colors } = useTheme();
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
          {empty}
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

export const styles = StyleSheet.create({});
