/* Adaptador sobre el dataset embebido: etiquetas, colores y descarga de CSV.
   Todo lo que necesita saber "cómo se llama" o "de qué color es" algo vive acá. */
(function (global) {
  'use strict';

  const Datos = {
    raw: null,
    config: null,
    motor: null,
    mostrarNombres: true,

    inicializar: function (datos, motor) {
      Datos.raw = datos;
      Datos.config = datos.config;
      Datos.motor = motor;
      return Datos;
    },

    // ------------------------------------------------------------- etiquetas

    jefe: function (i) {
      if (i === null || i === undefined || i < 0) return 'Sin asignar';
      return Datos.raw.dim.jefes[i] || 'Sin asignar';
    },

    localidad: function (i) {
      if (i === null || i === undefined || i < 0) return 'Sin localidad';
      return Datos.raw.dim.localidades[i] || 'Sin localidad';
    },

    provincia: function (i) {
      if (i === null || i === undefined || i < 0) return 'Sin provincia';
      return Datos.raw.dim.provincias[i] || 'Sin provincia';
    },

    /* Grupo de pares del local (D-27): la vara contra la que se lo compara. */
    plaza: function (i) {
      const plazas = Datos.raw.dim.plazas || [];
      if (i === null || i === undefined || i < 0) return 'Sin grupo';
      return plazas[i] || 'Sin grupo';
    },

    local: function (i) {
      if (i === null || i === undefined || i < 0) return 'Sin local';
      return Datos.raw.dim.locales.nombre[i] || 'Sin local';
    },

    idLocal: function (i) {
      return i >= 0 ? Datos.raw.dim.locales.id[i] : '';
    },

    /* Respeta el filtro "Mostrar cajeros: Nombre o solo ID" (§5). */
    cajero: function (i) {
      if (i === null || i === undefined || i < 0) return '—';
      const id = Datos.raw.dim.cajeros.id[i];
      if (!Datos.mostrarNombres) return id || '—';
      return Datos.raw.dim.cajeros.nombre[i] || id || '—';
    },

    idCajero: function (i) {
      return i >= 0 ? Datos.raw.dim.cajeros.id[i] : '';
    },

    tipo: function (i) {
      const crudo = Datos.raw.dim.tiposOperacion[i];
      const etiquetas = Datos.config.tipos_operacion.etiquetas || {};
      return etiquetas[crudo] || crudo || '—';
    },

    /* Grupo (D-01): SF2 sin TEC, TEC o MT. */
    grupo: function (i) {
      const grupos = Datos.raw.dim.grupos || [];
      const crudo = grupos[i];
      const etiquetas = (Datos.config.grupos && Datos.config.grupos.etiquetas) || {};
      return etiquetas[crudo] || crudo || '—';
    },

    grupoCrudo: function (i) {
      const grupos = Datos.raw.dim.grupos || [];
      return grupos[i] || '';
    },

    descripcionGrupo: function (i) {
      const descripciones = (Datos.config.grupos && Datos.config.grupos.descripciones) || {};
      return descripciones[Datos.grupoCrudo(i)] || '';
    },

    zona: function (i) {
      if (i === 0) return Datos.config.tipo_zona.etiquetas.alto;
      if (i === 1) return Datos.config.tipo_zona.etiquetas.bajo;
      return 'Sin zona';
    },

    categoria: function (clave) {
      return Datos.config.productividad.etiquetas_categoria[clave] || clave;
    },

    // --------------------------------------------------------------- colores

    colorJefe: function (i) {
      const paleta = Datos.config.colores.jefes_zonales;
      return paleta[i % paleta.length];
    },

    colorCategoria: function (clave) {
      return Datos.config.colores.categorias[clave] || Datos.config.colores.categorias.sin_datos;
    },

    colorZona: function (i) {
      return i === 0 ? Datos.config.colores.tipo_zona.alto : Datos.config.colores.tipo_zona.bajo;
    },

    colorGrupo: function (i) {
      const porNombre = Datos.config.colores.grupos || {};
      const crudo = Datos.grupoCrudo(i);
      if (porNombre[crudo]) return porNombre[crudo];
      const paleta = Datos.config.colores.jefes_zonales;
      return paleta[i % paleta.length];
    },

    color: function (nombre) {
      return Datos.config.colores.series[nombre];
    },

    // ----------------------------------------------------------- disponibles

    hay: function (clave) {
      return !!Datos.raw.meta.opcionales[clave];
    },

    /* Sin padrón de usuarios, "habilitado" se infiere de la propia actividad y
       deja de ser un dato auditable: las láminas cambian qué número destacan. */
    dotacionInferida: function () {
      return !!Datos.raw.meta.altas_inferidas;
    },

    /* Cómo se llama la dotación según de dónde salga. */
    etiquetaHabilitados: function () {
      return Datos.dotacionInferida() ? 'Dotación estimada' : 'Cajeros habilitados';
    },

    etiquetaInactivos: function () {
      return Datos.dotacionInferida() ? 'Meses sin operar' : 'Sin actividad';
    },

    // ------------------------------------------------------------------ CSV

    /* Descarga en CSV de lo que se está viendo (§7.8). Separador ; y BOM, que
       es lo que Excel en español abre sin preguntar nada. */
    descargarCsv: function (nombreArchivo, encabezados, filas) {
      const campo = function (valor) {
        if (valor === null || valor === undefined) return '';
        let texto = String(valor);
        if (/^[=+\-@]/.test(texto) && Number.isNaN(Number(texto))) texto = "'" + texto;
        if (/[";\n]/.test(texto)) texto = '"' + texto.replace(/"/g, '""') + '"';
        return texto;
      };
      const lineas = [encabezados.map(campo).join(';')];
      filas.forEach(function (fila) {
        lineas.push(fila.map(campo).join(';'));
      });
      const contenido = '﻿' + lineas.join('\r\n');
      const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreArchivo;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
    },

    /* Número para CSV: coma decimal, sin separador de miles (Excel es-AR). */
    numeroCsv: function (valor, decimales) {
      if (valor === null || valor === undefined || Number.isNaN(valor)) return '';
      return valor.toFixed(decimales === undefined ? 2 : decimales).replace('.', ',');
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Datos;
  else global.Datos = Datos;
})(typeof globalThis !== 'undefined' ? globalThis : this);
