// ============================================================
// NÍVEL DIGITAL - Programação Mobile 2
// React Native + Expo + expo-sensors (Accelerometer)
// ============================================================
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';

// ------------------------------------------------------------
// CONSTANTES (ajustes do experimento)
// ------------------------------------------------------------
const INTERVALO_MS = 100;       // Sensor: lê o acelerômetro a cada 100 ms (10 leituras/s)
const FATOR_SUAVIZACAO = 0.2;   // Filtro: peso da leitura nova (0 a 1). Menor = mais suave
const ZONA_CENTRAL = 0.03;      // Tolerância em g (~1,7°) para considerar "nivelado"
const G_MAXIMO_VISUAL = 0.15;   // Inclinação (em g) em que a bolha chega na borda (~8,6°)
const RAIO_ALVO = 130;          // Raio do círculo grande, em pixels
const RAIO_BOLHA = 22;          // Raio da bolha, em pixels

// Distância máxima que o CENTRO da bolha pode andar sem sair do alvo
const LIMITE_BOLHA = RAIO_ALVO - RAIO_BOLHA;
// Conversão: quantos pixels a bolha anda para cada 1 g de inclinação
const PIXELS_POR_G = LIMITE_BOLHA / G_MAXIMO_VISUAL;

const COR_NIVELADO = '#2ecc71';
const COR_INCLINADO = '#e67e22';

// Física: Android e iOS usam sinais OPOSTOS para X e Y.
// O Android mede a "reação" à gravidade; o iOS mede a gravidade em si.
// Este sinal faz a bolha andar para o lado certo nos dois sistemas.
const SINAL_EIXOS = Platform.OS === 'android' ? -1 : 1;

// ------------------------------------------------------------
// FUNÇÕES AUXILIARES
// ------------------------------------------------------------

// Matemática: garante que o valor fique entre minimo e maximo
function clamp(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

// Matemática: média ponderada (filtro passa-baixa).
// Mistura a leitura nova com o valor anterior para reduzir tremedeira.
function suavizar(valorAnterior, valorNovo) {
  return FATOR_SUAVIZACAO * valorNovo + (1 - FATOR_SUAVIZACAO) * valorAnterior;
}

// ------------------------------------------------------------
// COMPONENTE PRINCIPAL
// ------------------------------------------------------------
export default function App() {
  // Estado: true = lendo o sensor, false = pausado
  const [lendo, setLendo] = useState(true);

  // Estado: últimos valores JÁ suavizados dos três eixos (em g)
  // Começa com o celular "deitado" (Z = 1 g, X e Y = 0)
  const [leitura, setLeitura] = useState({ x: 0, y: 0, z: 1 });
  const { x: inclinacaoX, y: inclinacaoY, z: inclinacaoZ } = leitura;

  // ----------------------------------------------------------
  // SENSOR: liga e desliga o acelerômetro
  // ----------------------------------------------------------
  useEffect(() => {
    if (!lendo) return; // Pausado: não escuta o sensor

    Accelerometer.setUpdateInterval(INTERVALO_MS);

    // Física: o acelerômetro mede a gravidade (em g) projetada em cada eixo.
    // Cada vez que o sensor envia dados, aplicamos o filtro de suavização.
    const assinatura = Accelerometer.addListener((dado) => {
      setLeitura((anterior) => ({
        x: suavizar(anterior.x, dado.x),
        y: suavizar(anterior.y, dado.y),
        z: suavizar(anterior.z, dado.z),
      }));
    });

    // Limpeza: ao pausar ou fechar o app, para de escutar o sensor
    return () => assinatura.remove();
  }, [lendo]);

  // ----------------------------------------------------------
  // CÁLCULOS
  // ----------------------------------------------------------

  // Física: a gravidade (1 g) aponta para o eixo "mais vertical" do aparelho.
  // Em pé (celular de pé): a gravidade está no eixo Y.
  // Deitado (celular sobre a mesa): a gravidade está no eixo Z.
  // Lógica: o eixo com maior valor absoluto indica a posição.
  const estaEmPe = Math.abs(inclinacaoY) > Math.abs(inclinacaoZ);

  // Física: o eixo da gravidade é a "referência". Os outros dois eixos
  // medem o desvio, e são eles que movem a bolha.
  //   Em pé:   horizontal = X (inclinação no plano da tela), vertical = Z (para trás/frente)
  //   Deitado: horizontal = X, vertical = Y
  // O SINAL_EIXOS corrige a diferença entre Android e iOS.
  // direcaoX positivo = bolha para a direita. direcaoY positivo = bolha para cima.
  // O painel continua mostrando os valores BRUTOS do sensor.
  const direcaoX = inclinacaoX * SINAL_EIXOS;
  let direcaoY;
  let componenteDaGravidade; // parte da gravidade no eixo de referência, em g
  if (estaEmPe) {
    direcaoY = -inclinacaoZ * SINAL_EIXOS;
    componenteDaGravidade = inclinacaoY;
  } else {
    direcaoY = inclinacaoY * SINAL_EIXOS;
    componenteDaGravidade = inclinacaoZ;
  }

  // Matemática (Pitágoras): distância do ponto (direcaoX, direcaoY) até o centro, em g
  const distanciaDoCentro = Math.sqrt(direcaoX ** 2 + direcaoY ** 2);

  // Lógica: está nivelado se a distância é menor ou igual à tolerância
  const estaNivelado = distanciaDoCentro <= ZONA_CENTRAL;

  // Matemática: ângulo de desvio em relação à posição ideal.
  // Arco-tangente: desvio da gravidade / gravidade no eixo de referência.
  // Math.abs evita depender do sinal do eixo (muda entre iOS e Android).
  const anguloGraus =
    (Math.atan2(distanciaDoCentro, Math.abs(componenteDaGravidade)) * 180) / Math.PI;

  // Física -> pixels: gravidade em g vira deslocamento na tela.
  // O sinal negativo no Y existe porque, na tela, o eixo Y cresce para BAIXO.
  const deslocamentoX = direcaoX * PIXELS_POR_G;
  const deslocamentoY = -direcaoY * PIXELS_POR_G;

  // Clamp: limita o deslocamento ao círculo (a bolha nunca sai do alvo)
  const distanciaPixels = Math.sqrt(deslocamentoX ** 2 + deslocamentoY ** 2);
  const distanciaLimitada = clamp(distanciaPixels, 0, LIMITE_BOLHA);
  const fatorDeEscala = distanciaPixels > 0 ? distanciaLimitada / distanciaPixels : 0;
  const bolhaX = deslocamentoX * fatorDeEscala;
  const bolhaY = deslocamentoY * fatorDeEscala;

  // ----------------------------------------------------------
  // DECISÃO: texto de status e cor
  // ----------------------------------------------------------
  let textoStatus;
  if (estaNivelado) {
    textoStatus = 'Nivelado';
  } else if (Math.abs(direcaoX) >= Math.abs(direcaoY)) {
    // Inclinação lateral é maior que a vertical
    textoStatus = direcaoX > 0 ? 'Inclinado para a direita' : 'Inclinado para a esquerda';
  } else {
    if (estaEmPe) {
      // Em pé: o topo do aparelho vai para trás ou para frente
      textoStatus = direcaoY > 0 ? 'Inclinado para trás' : 'Inclinado para frente';
    } else {
      textoStatus = direcaoY > 0 ? 'Inclinado para cima' : 'Inclinado para baixo';
    }
  }
  const corAtual = estaNivelado ? COR_NIVELADO : COR_INCLINADO;

  // ----------------------------------------------------------
  // INTERFACE
  // ----------------------------------------------------------
  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>Nível Digital</Text>

      {/* Status em texto */}
      <Text style={[estilos.status, { color: corAtual }]}>{textoStatus}</Text>

      {/* Alvo (círculo grande) com a bolha dentro */}
      <View style={[estilos.alvo, { borderColor: corAtual }]}>
        {/* Linhas da mira */}
        <View style={estilos.linhaHorizontal} />
        <View style={estilos.linhaVertical} />

        {/* Anel que mostra o tamanho da zona central */}
        <View style={estilos.zonaCentral} />

        {/* Bolha: usa translate para andar a partir do centro */}
        <View
          style={[
            estilos.bolha,
            {
              backgroundColor: corAtual,
              transform: [{ translateX: bolhaX }, { translateY: bolhaY }],
            },
          ]}
        />
      </View>

      {/* Painel de dados para o relatório */}
      <View style={estilos.painel}>
        <Text style={estilos.linhaPainel}>X: {inclinacaoX.toFixed(3)} g</Text>
        <Text style={estilos.linhaPainel}>Y: {inclinacaoY.toFixed(3)} g</Text>
        <Text style={estilos.linhaPainel}>Z: {inclinacaoZ.toFixed(3)} g</Text>
        <Text style={estilos.linhaPainelDestaque}>
          Inclinação: {anguloGraus.toFixed(1)}°
        </Text>
        <Text style={estilos.legenda}>
          Posição: {estaEmPe ? 'em pé' : 'deitado'}
        </Text>
        <Text style={estilos.legenda}>
          Tolerância: {ZONA_CENTRAL} g | Suavização: {FATOR_SUAVIZACAO}
        </Text>
      </View>

      {/* Botão pausar / retomar */}
      <TouchableOpacity
        style={[estilos.botao, { backgroundColor: lendo ? '#34495e' : '#2980b9' }]}
        onPress={() => setLendo(!lendo)}
      >
        <Text style={estilos.textoBotao}>
          {lendo ? 'Pausar leitura' : 'Retomar leitura'}
        </Text>
      </TouchableOpacity>

      {!lendo && <Text style={estilos.aviso}>Leitura pausada</Text>}
    </View>
  );
}

// ------------------------------------------------------------
// ESTILOS
// ------------------------------------------------------------
const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    backgroundColor: '#1b1f24',
    alignItems: 'center',
    paddingTop: 60,
  },
  titulo: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  status: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 20,
  },
  alvo: {
    width: RAIO_ALVO * 2,
    height: RAIO_ALVO * 2,
    borderRadius: RAIO_ALVO,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linhaHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: '#4a5560',
  },
  linhaVertical: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: '#4a5560',
  },
  zonaCentral: {
    position: 'absolute',
    width: ZONA_CENTRAL * PIXELS_POR_G * 2,
    height: ZONA_CENTRAL * PIXELS_POR_G * 2,
    borderRadius: ZONA_CENTRAL * PIXELS_POR_G,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  bolha: {
    width: RAIO_BOLHA * 2,
    height: RAIO_BOLHA * 2,
    borderRadius: RAIO_BOLHA,
    opacity: 0.85,
  },
  painel: {
    marginTop: 24,
    padding: 14,
    backgroundColor: '#262c33',
    borderRadius: 10,
    width: 260,
  },
  linhaPainel: {
    color: '#dfe6ec',
    fontSize: 16,
    marginBottom: 3,
  },
  linhaPainelDestaque: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  legenda: {
    color: '#8a96a3',
    fontSize: 12,
    marginTop: 8,
  },
  botao: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  textoBotao: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  aviso: {
    color: '#f1c40f',
    marginTop: 10,
  },
});