import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Importar os SVGs
import BackgroundLoginSvg from '../img-ref/background_login.svg';
import LogoEvosSvg from '../img-ref/logo-evos.svg';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => void;
  onForgotPassword?: () => void;
}

const { width, height } = Dimensions.get('window');

// Detectar se é um celular pequeno (altura menor que 700px)
const isSmallDevice = height < 700;
const isMediumDevice = height >= 700 && height < 800;

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onForgotPassword }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    setLoading(true);
    
    setTimeout(() => {
      setLoading(false);
      onLogin(email, password);
    }, 1000);
  };

  return (
    <View style={styles.container}>
      {/* Background SVG ocupando toda a tela - FIXO */}
      <View style={styles.backgroundContainer}>
        <BackgroundLoginSvg 
          width="100%" 
          height="100%" 
          viewBox="0 0 375 1000"
          preserveAspectRatio="xMidYMid slice"
          style={styles.backgroundSvg}
        />
      </View>

      {/* KeyboardAvoidingView para celulares menores */}
      <KeyboardAvoidingView 
        style={styles.keyboardWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        enabled={isSmallDevice || isMediumDevice}
      >
        {/* ScrollView para conteúdo */}
        <ScrollView 
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo EVOS */}
          <View style={styles.logoContainer}>
            <LogoEvosSvg 
              width={width * (isSmallDevice ? 0.5 : 0.6)} 
              height={(width * (isSmallDevice ? 0.5 : 0.6)) * 0.31} 
              preserveAspectRatio="xMidYMid meet"
            />
          </View>

          {/* Form container - mais baixo */}
          <View style={styles.formContainer}>
            <Text style={styles.title}>Acesse sua conta</Text>

            {/* Email input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Ionicons name="person" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
            </View>

            {/* Password input */}
            <View style={styles.inputContainer}>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed" size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Senha"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                />
                <TouchableOpacity
                  style={styles.eyeIcon}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot password link */}
            <TouchableOpacity 
              style={styles.forgotPasswordButton}
              onPress={onForgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Esqueci minha senha</Text>
            </TouchableOpacity>

            {/* Login button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.loginButtonText}>
                {loading ? 'Entrando...' : 'Entrar'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  backgroundSvg: {
    width: '100%',
    height: '100%',
  },
  keyboardWrapper: {
    flex: 1,
    zIndex: 2,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: height * (isSmallDevice ? 0.08 : isMediumDevice ? 0.12 : 0.15),
    paddingBottom: height * (isSmallDevice ? 0.04 : 0.08),
    minHeight: height * (isSmallDevice ? 0.2 : 0.3),
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: width * 0.08,
    paddingTop: height * (isSmallDevice ? 0.02 : 0.08),
    paddingBottom: height * (isSmallDevice ? 0.08 : 0.05),
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: width * 0.05,
    fontWeight: '500',
    color: '#333',
    marginBottom: height * (isSmallDevice ? 0.02 : 0.04),
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: height * (isSmallDevice ? 0.015 : 0.02),
  },
  inputWrapper: {
    backgroundColor: 'white',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: width * 0.04,
    height: height * (isSmallDevice ? 0.055 : 0.065),
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  inputIcon: {
    marginRight: width * 0.03,
  },
  input: {
    flex: 1,
    fontSize: width * 0.04,
    color: '#333',
  },
  passwordInput: {
    flex: 1,
    fontSize: width * 0.04,
    color: '#333',
  },
  eyeIcon: {
    padding: 4,
  },
  forgotPasswordButton: {
    alignItems: 'center',
    marginTop: height * (isSmallDevice ? 0.01 : 0.015),
    marginBottom: height * (isSmallDevice ? 0.02 : 0.03),
  },
  forgotPasswordText: {
    color: '#666',
    fontSize: width * 0.035,
    textDecorationLine: 'underline',
  },
  loginButton: {
    backgroundColor: '#84cc16',
    borderRadius: 8,
    height: height * (isSmallDevice ? 0.055 : 0.065),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  loginButtonDisabled: {
    backgroundColor: '#a1a1aa',
  },
  loginButtonText: {
    color: 'white',
    fontSize: width * 0.04,
    fontWeight: '600',
  },
});

export default LoginScreen; 